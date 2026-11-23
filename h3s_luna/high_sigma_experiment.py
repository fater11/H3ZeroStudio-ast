"""Experimental, opt-in pass-2 sigma reshaping for MiniMax H3.

This helper does not alter the starting denoise strength, the finest nonzero
sigma, the number of steps, or the zero endpoint. It is deliberately not
connected to production sampling until a same-seed video A/B passes.
"""


def frontload_high_sigmas(sigmas, rho=7.0):
    """Redistribute only interior high-res sigmas with a Karras-style curve.

    A 3-step run [s0, s1, s2, 0] becomes [s0, karras_mid, s2, 0].
    Preserving s0 is critical: changing it would change the denoise amount
    and invalidate the A/B comparison. Preserving s2 protects the final
    fine-detail step. The return value is a clone, not an in-place edit.
    """
    if sigmas.ndim != 1 or len(sigmas) < 2:
        raise ValueError("High-res SIGMAS must be a 1-D vector of >= 2 values")
    if not 0.0 < float(rho) <= 100:
        raise ValueError("rho must be in (0, 100]")
    if not bool((sigmas[1:] < sigmas[:-1]).all()):
        raise ValueError("High-res SIGMAS must be strictly descending")
    if not bool((sigmas == sigmas).all()) or float(sigmas[-1]) != 0.0:
        raise ValueError("High-res SIGMAS must be finite and end at zero")
    out = sigmas.clone()
    count = len(sigmas)
    if count < 4:  # <= 2 steps have no safely movable interior sigma.
        return out
    largest, smallest = float(sigmas[0]), float(sigmas[-2])
    if not 0.0 < smallest < largest <= 1.0:
        raise ValueError("High-res SIGMAS must lie in (0, 1] before final zero")
    start, stop = largest ** (1.0 / rho), smallest ** (1.0 / rho)
    for i in range(1, count - 2):
        frac = i / (count - 2)
        out[i] = (start + frac * (stop - start)) ** rho
    if not bool((out[1:] < out[:-1]).all()):
        raise ValueError("Reshaped high-res SIGMAS are not strictly descending")
    return out
