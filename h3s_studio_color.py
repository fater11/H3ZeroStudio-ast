"""Lab colour continuity and latent anchoring, isolated to the h3studio mode.

Adapted from H3Studio-LD/vendor/h3render/seamfix.py and seamanchor.py (GPL-3.0
distribution). Those files credit the MIT-licensed ComfyUI-Hand-Tie-Clips
(sandpies) and ComfyUI-MiniMaxH3-ToneCompensate (rkfg).
Original attribution and licensing are retained here for derivative code.
No code in this module runs in the overlap or protected continuation modes.
"""
import math
import torch

FRAME_PER_TOKEN = (1, 4, 4, 4, 4)


def whole_steps(n):
    """Latent video steps covering exactly n pixel frames (5/22/39/56 -> 2/7/12/17), else 0."""
    n, k, covered = int(n), 0, 0
    while covered < n and k < 4096:
        covered += FRAME_PER_TOKEN[k % len(FRAME_PER_TOKEN)]
        k += 1
    return k if covered == n else 0



def _parts(lat):
    x = (lat or {}).get("samples") if isinstance(lat, dict) else None
    if isinstance(x, torch.Tensor):
        return [x]
    if getattr(x, "is_nested", False):
        return list(x.unbind())
    return None


def _rebuild(x, parts):
    return parts[0] if isinstance(x, torch.Tensor) else type(x)(parts)


def _v5(t):
    return t.unsqueeze(0) if t.ndim == 4 else t



def calibrate(sampled, prev_lat, n_frames, clip_no=0):
    """The body's opening 5 steps pulled to the tail's per-channel mean/std (full for 6 steps, a cosine taper over
    the next 14, so drift cannot ride the whole clip), and the head made the tail exactly."""
    s, p = _parts(sampled), _parts(prev_lat)
    v = whole_steps(n_frames)
    if not s or not p or v <= 0:
        return sampled
    cur = _v5(s[0]).float().clone()
    prev = _v5(p[0]).float().to(cur.device)
    tn, pn = int(cur.shape[2]), int(prev.shape[2])
    if tn <= v + 5 or pn < max(v, 5) or cur.shape[1] != prev.shape[1] or cur.shape[3:] != prev.shape[3:]:
        return sampled
    src = prev[:, :, -v - 5:-v] if pn >= v + 5 else prev[:, :, -5:]
    opn = cur[:, :, v:v + 5]
    dims = (2, 3, 4)
    m_src, m_opn = src.mean(dims, keepdim=True), opn.mean(dims, keepdim=True)
    gain = (src.std(dims, keepdim=True).clamp(min=1e-5) / opn.std(dims, keepdim=True).clamp(min=1e-5)).clamp(0.85, 1.15)
    body = cur[:, :, v:]
    nb = int(body.shape[2])
    w = torch.zeros(nb, device=cur.device)
    hold, taper = min(6, nb), min(14, max(0, nb - 6))
    w[:hold] = 1.0
    if taper:
        x = torch.linspace(0.0, 1.0, taper + 2, device=cur.device)[1:-1]
        w[hold:hold + taper] = 0.5 * (1.0 + torch.cos(math.pi * x))
    w = w.view(1, 1, nb, 1, 1)
    cur[:, :, v:] = body * (1.0 - w) + ((body - m_opn) * gain + m_src) * w
    cur[:, :, :v] = prev[:, :, -v:]
    s[0] = cur.to(dtype=s[0].dtype).reshape(s[0].shape)
    out = dict(sampled)
    out["samples"] = _rebuild(sampled["samples"], s)
    print("[H3ZS]   clip %d: seam latent locked to the previous tail (gain %.3f, mean %+.4f)"
          % (clip_no, float(gain.mean()), float((m_src - m_opn).mean())), flush=True)
    return out



def _band_split(t, sigma=2.0):
    if t.dim() < 2 or t.shape[-1] < 8 or t.shape[-2] < 8:
        return None
    import torch.nn.functional as F
    r = max(1, int(round(3.0 * float(sigma))))
    x = torch.arange(-r, r + 1, dtype=torch.float32, device=t.device)
    k = torch.exp(-(x * x) / (2.0 * float(sigma) ** 2))
    k = (k / k.sum()).to(t.dtype)
    h, w = int(t.shape[-2]), int(t.shape[-1])
    flat = t.reshape(-1, 1, h, w)
    lo = F.conv2d(F.pad(flat, (r, r, 0, 0), mode="replicate"), k.view(1, 1, 1, -1))
    lo = F.conv2d(F.pad(lo, (0, 0, r, r), mode="replicate"), k.view(1, 1, -1, 1)).reshape(t.shape)
    return lo, t - lo


def _band_ratio(t, sigma=2.0):
    got = _band_split(t, sigma)
    if got is None:
        return None
    tot = float(t.float().std())
    return (float(got[1].float().std()) / tot) if (tot and tot == tot) else None


def _match_band(t, target_ratio, sigma=2.0, clamp=(0.75, 1.25)):
    got = _band_split(t, sigma)
    if got is None or not target_ratio:
        return t, 1.0
    lo, hi = got
    cur_hi = float(hi.float().std())
    if not cur_hi or cur_hi != cur_hi:
        return t, 1.0
    r = min(float(target_ratio), 0.999)
    lo_sd = float(lo.float().std())
    k = (r * lo_sd) / (cur_hi * max(1e-6, (1.0 - r * r) ** 0.5))
    for _ in range(4):
        k = min(max(k, clamp[0]), clamp[1])
        got_r = _band_ratio(lo + hi * k, sigma)
        if not got_r or abs(got_r - r) <= 1e-4 * max(r, 1e-6):
            break
        k *= r / got_r
    k = min(max(k, clamp[0]), clamp[1])
    return lo + hi * k, k


def latent_anchor(sampled, ref_lat, n_frames=0, clip_no=0, strength=0.45):
    """Hold a chained clip's video latent to Clip 1's [C, 5] mod5 means, per-channel std, and spatial high-band ratio.
    Leaves the carried overlap head (0..v_steps-1) untouched and ramps in over 5 steps so the join cannot step."""
    s, r = _parts(sampled), _parts(ref_lat)
    if not s or not r:
        return sampled
    cur = _v5(s[0]).float().clone()
    ref = _v5(r[0]).float().to(cur.device)
    if cur.shape[1] != ref.shape[1] or cur.shape[3:] != ref.shape[3:]:
        return sampled
    v = whole_steps(n_frames) if n_frames else 0
    tn, rn = int(cur.shape[2]), int(ref.shape[2])
    if tn <= v + 2 or rn < 5:
        return sampled
    # 1. Per-channel, per-mod5-phase mean pull + per-channel std pull on the delivered body (v..tn)
    c_mod = torch.zeros((int(cur.shape[1]), 5), dtype=torch.float32, device=cur.device)
    r_mod = torch.zeros((int(cur.shape[1]), 5), dtype=torch.float32, device=cur.device)
    for p in range(5):
        idx_c = [k for k in range(v, tn) if k % 5 == p]
        idx_r = [k for k in range(0, rn) if k % 5 == p]
        if idx_c:
            c_mod[:, p] = cur[:, :, idx_c].mean(dim=(0, 2, 3, 4))
        if idx_r:
            r_mod[:, p] = ref[:, :, idx_r].mean(dim=(0, 2, 3, 4))
    off = (r_mod - c_mod) * float(strength)
    c_std = cur[:, :, v:].std(dim=(0, 2, 3, 4), keepdim=True).clamp(min=1e-5)
    r_std = ref.std(dim=(0, 2, 3, 4), keepdim=True).clamp(min=1e-5)
    gain = (1.0 + (r_std / c_std - 1.0) * float(strength)).clamp(0.88, 1.12)
    c_mean_all = cur[:, :, v:].mean(dim=(0, 2, 3, 4), keepdim=True)
    # 2. Spatial high-band ratio pull toward Clip 1's ratio
    ref_ratio = _band_ratio(ref)
    body = (cur[:, :, v:] - c_mean_all) * gain + c_mean_all
    for k in range(v, tn):
        body[:, :, k - v] += off[:, k % 5].view(1, -1, 1, 1)
    body_matched, k_hi = _match_band(body, ref_ratio)
    # Ramp over first 5 delivered steps (17 frames) so the seam at step v is untouched
    nb = tn - v
    ramp = min(5, nb)
    w = torch.ones(nb, dtype=torch.float32, device=cur.device)
    if ramp > 0 and v > 0:
        w[:ramp] = torch.linspace(0.0, 1.0, ramp + 1, device=cur.device)[1:]
    wv = w.view(1, 1, nb, 1, 1)
    cur[:, :, v:] = cur[:, :, v:] * (1.0 - wv) + body_matched * wv
    s[0] = cur.to(dtype=s[0].dtype).reshape(s[0].shape)
    out = dict(sampled)
    out["samples"] = _rebuild(sampled["samples"], s)
    print("[H3ZS]   clip %d: latent anchor to clip 1 (mean %+.4f, std x%.3f, hi_band x%.3f)"
          % (clip_no, float(off.mean()), float(gain.mean()), float(k_hi)), flush=True)
    return out


def tone_shift(prev_imgs, imgs, n, clip_no=0):
    """frame_shift: the head's per-frame per-channel mean minus the previous tail's, taken off the head frame by
    frame and, as the last overlap frame's value, off the rest - so the join itself is exact."""
    n = min(int(n), int(prev_imgs.shape[0]), int(imgs.shape[0]))
    if n <= 0:
        return imgs
    src, tgt = prev_imgs[-n:].float().to(imgs.device), imgs.float()
    drift = tgt[:n].mean(dim=(1, 2), keepdim=True) - src.mean(dim=(1, 2), keepdim=True)
    out = tgt.clone()
    out[:n] -= drift
    out[n:] -= drift[-1]
    d = drift[-1].reshape(-1) * 255
    print("[H3ZS]   clip %d: seam tone %+.1f %+.1f %+.1f /255" % (clip_no, d[0], d[1], d[2]), flush=True)
    return out.clamp(0.0, 1.0).to(imgs.dtype)


def bridge_pair(before, after, pre=16, post=28):
    """bridge() across the join of two delivered clips, written back into both (the chain keeps clips apart)."""
    a, b = min(pre + 5, int(before.shape[0])), min(post + 4, int(after.shape[0]))   # bridge() needs seam > pre + 4
    film = torch.cat([before[-a:].float().cpu(), after[:b].float().cpu()])
    bridge(film, a, int(after.shape[0]), pre, post)
    before[-a:] = film[:a].to(device=before.device, dtype=before.dtype)
    after[:b] = film[a:].to(device=after.device, dtype=after.dtype)


def bridge(film, seam, keep, pre=16, post=28):
    """In place on the joined frames: mean/std eased from before the last block's dip to after the opening's
    rebound, a cosine bell peaking at the join."""
    if film is None or seam <= pre + 4 or keep <= post + 4:
        return
    pre, post = min(pre, seam - 4), min(post, keep - 4)
    a = film[seam - pre - 4:seam - pre].float()
    b = film[seam + post:seam + post + 4].float()
    am, bm = a.mean(dim=(0, 1, 2), keepdim=True), b.mean(dim=(0, 1, 2), keepdim=True)
    asd, bsd = a.std(dim=(0, 1, 2), keepdim=True).clamp(min=1e-5), b.std(dim=(0, 1, 2), keepdim=True).clamp(min=1e-5)
    total = pre + post
    for k in range(total):
        i = seam - pre + k
        t = (k + 0.5) / total
        ts = t * t * (3.0 - 2.0 * t)
        want_m, want_s = (am * (1 - ts) + bm * ts)[0], (asd * (1 - ts) + bsd * ts)[0]
        dist = abs(k - pre) / float(pre if k < pre else post)
        w = 0.5 * (1.0 + math.cos(math.pi * min(1.0, dist)))
        f = film[i].float()
        fm, fs = f.mean(dim=(0, 1), keepdim=True), f.std(dim=(0, 1), keepdim=True).clamp(min=1e-5)
        fc = (f - fm) * (want_s / fs).clamp(0.85, 1.15) + want_m
        film[i] = (f * (1 - w) + fc * w).clamp(0.0, 1.0).to(film.dtype)


STRENGTH = 0.65     # fraction of L* / contrast gap closed per clip
CHROMA_STRENGTH = 0.85  # fraction of a* / b* warmth & chroma-spread gap closed per clip
MAX_SHIFT = 8.0     # Lab units per clip
MAX_GAIN = 0.18     # cap on spread ratios
RAMP = 48           # frames to full correction (2 s)
SAMPLE = 24         # frames read to measure a clip
_CHUNK = 8_000_000  # pixels converted at once

_SRGB_TO_XYZ = ((0.4124564, 0.3575761, 0.1804375), (0.2126729, 0.7151522, 0.0721750), (0.0193339, 0.1191920, 0.9503041))
_XYZ_TO_SRGB = ((3.2404542, -1.5371385, -0.4985314), (-0.9692660, 1.8760108, 0.0415560), (0.0556434, -0.2040259, 1.0572252))
_WHITE = (0.95047, 1.00000, 1.08883)
_EPS, _KAPPA = 216.0 / 24389.0, 24389.0 / 27.0
_F_TO_LAB = ((0.0, 116.0, 0.0), (500.0, -500.0, 0.0), (0.0, 200.0, -200.0))
_LAB_TO_F = ((1.0 / 116.0, 1.0 / 500.0, 0.0), (1.0 / 116.0, 0.0, 0.0), (1.0 / 116.0, 0.0, -1.0 / 200.0))
_LAB_BIAS, _F_BIAS = (-16.0, 0.0, 0.0), (16.0 / 116.0,) * 3


def _c(values, like):
    t = torch.tensor(values, dtype=like.dtype, device=like.device)
    return t.transpose(0, 1).contiguous() if t.dim() == 2 else t


def to_lab(rgb):
    c = rgb.clamp(0.0, 1.0)
    lin = torch.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    t = (lin @ _c(_SRGB_TO_XYZ, lin) / _c(_WHITE, lin)).clamp_min(0.0)
    f = torch.where(t > _EPS, t.clamp_min(1e-12) ** (1.0 / 3.0), (_KAPPA * t + 16.0) / 116.0)
    return f @ _c(_F_TO_LAB, f) + _c(_LAB_BIAS, f)


def to_rgb(lab):
    f = lab @ _c(_LAB_TO_F, lab) + _c(_F_BIAS, lab)
    f3 = f ** 3
    t = torch.where(f3 > _EPS, f3, (116.0 * f - 16.0) / _KAPPA)
    lin = ((t * _c(_WHITE, t)) @ _c(_XYZ_TO_SRGB, t)).clamp_min(0.0)
    return torch.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin.clamp_min(1e-12) ** (1.0 / 2.4) - 0.055).clamp(0, 1)


def _step(n, h, w):
    return max(1, min(int(n), _CHUNK // max(1, h * w)))


def stats(imgs, start=0, window=0):
    """[L* mean, a* mean, b* mean, L* spread, a* spread, b* spread] over up to SAMPLE frames from `start` on, or None."""
    x = imgs[int(start):int(start) + int(window)] if window and int(window) > 0 else imgs[int(start):]
    n = int(x.shape[0])
    if n == 0:
        return None
    if SAMPLE < n:
        x = x[torch.linspace(0, n - 1, SAMPLE).round().long().unique()]
    n, h, w = int(x.shape[0]), int(x.shape[1]), int(x.shape[2])
    tot, sq, count = torch.zeros(3, dtype=torch.float64), torch.zeros(3, dtype=torch.float64), 0
    for s in range(0, n, _step(n, h, w)):
        flat = to_lab(x[s:s + _step(n, h, w)].float()).reshape(-1, 3).double()
        tot += flat.sum(0).cpu()
        sq += (flat ** 2).sum(0).cpu()
        count += int(flat.shape[0])
    mean = tot / count
    spread = (sq / count - mean ** 2).clamp_min(0.0).sqrt()
    return torch.tensor([*mean.tolist(), *spread.tolist()], dtype=torch.float32)


def pull(imgs, ref, start=0, clip_no=0):
    """imgs eased toward `ref` (stats of clip 1's opening): frames before `start` (the trimmed head) untouched, the pull
    fading in over RAMP frames from there and held after."""
    cur = stats(imgs, start)
    if ref is None or cur is None:
        return imgs
    st_vec = torch.tensor([STRENGTH, CHROMA_STRENGTH, CHROMA_STRENGTH], dtype=torch.float32)
    want = ((ref[:3] - cur[:3]) * st_vec).clamp(-MAX_SHIFT, MAX_SHIFT)
    gains = [1.0, 1.0, 1.0]
    for c_i, s_w in ((0, STRENGTH), (1, CHROMA_STRENGTH), (2, CHROMA_STRENGTH)):
        if len(cur) > 3 + c_i and len(ref) > 3 + c_i and cur[3 + c_i] > 1e-3 and ref[3 + c_i] > 1e-3:
            gains[c_i] = min(1 + MAX_GAIN, max(1 - MAX_GAIN, 1.0 + (float(ref[3 + c_i] / cur[3 + c_i]) - 1.0) * s_w))
    if float(want.abs().max()) < 0.08 and all(abs(g_x - 1.0) < 1e-3 for g_x in gains):
        return imgs
    n, start = int(imgs.shape[0]), int(start)
    w = torch.zeros(n)
    r = max(2, min(RAMP, n - start))
    w[start:start + r] = torch.linspace(0.0, 1.0, r)
    w[start + r:] = 1.0
    g = torch.tensor(gains, dtype=torch.float32)
    b = torch.tensor([float(cur[k]) * (1.0 - gains[k]) + float(want[k]) for k in range(3)], dtype=torch.float32)
    out = imgs.clone()
    h, wd = int(imgs.shape[1]), int(imgs.shape[2])
    for s in range(start, n, _step(n, h, wd)):
        e = min(n, s + _step(n, h, wd))
        src = imgs[s:e].float()
        rgb = to_rgb(to_lab(src) * g.to(src.device) + b.to(src.device))
        wt = w[s:e].to(src.device).view(-1, 1, 1, 1)
        out[s:e] = (src * (1.0 - wt) + rgb * wt).to(imgs.dtype)
    print("[H3ZS]   clip %d: anchor to clip 1 L*%+.2f a*%+.2f b*%+.2f spread x(%.3f,%.3f,%.3f)"
          % (clip_no, float(want[0]), float(want[1]), float(want[2]), gains[0], gains[1], gains[2]), flush=True)
    return out



