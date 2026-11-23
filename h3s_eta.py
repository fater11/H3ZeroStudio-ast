"""ETA for Low Res -> High Res and the post-sampling media stages.

The sampler has unequal arm costs (High Res is roughly twice a Low Res
step).  Count *work units*, not raw callbacks.  This is advisory only:
the sampler, output, cache keys and generated pixels are unaffected.
"""
import math


HIGH_STEP_WEIGHT = 2.0
DEFAULT_POST_SECONDS_PER_FRAME = 0.33


def step_weights(total_steps, low_steps, frame_scale=1.0):
    """A low/high plan with workload scaled to the clip's frame count.

    low_steps=None means a plain sampler whose steps all cost the same.
    """
    total = max(0, int(total_steps))
    scale = max(0.1, float(frame_scale))
    if low_steps is None:
        return (scale,) * total
    low = max(0, min(total, int(low_steps)))
    return (scale,) * low + (scale * HIGH_STEP_WEIGHT,) * (total - low)


class RunEta:
    """Online, memory-constant estimate for one generation run.

    The post-stage estimate is calibrated after each finished clip.  The
    first clip gets an intentionally approximate starting value; a running
    average adapts it to slow VAE/CPU paths on low-VRAM machines.
    """

    def __init__(self, step_plan, frames, post_sec_per_frame=DEFAULT_POST_SECONDS_PER_FRAME):
        self.plan = {int(k): tuple(float(x) for x in v) for k, v in step_plan.items()}
        self.frames = {int(k): max(1, int(v)) for k, v in frames.items()}
        self.post_sec_per_frame = float(post_sec_per_frame)
        self.done_steps = {}
        self.weight_done = 0.0
        self.sample_seconds = 0.0
        self.active_index = None
        self.last_clock = None
        self.post_index = None
        self.post_clock = None
        self.post_done = set()

    def begin_sample(self, index, now):
        self.active_index = int(index)
        self.last_clock = float(now)

    def sample_step(self, index, count, now):
        index = int(index)
        now = float(now)
        if self.active_index != index or self.last_clock is None:
            self.begin_sample(index, now)
        plan = self.plan.get(index, ())
        seen = self.done_steps.get(index, 0)
        count = max(seen, min(len(plan), int(count)))
        if count > seen:
            self.sample_seconds += max(0.0, now - self.last_clock)
            self.weight_done += sum(plan[seen:count])
            self.done_steps[index] = count
        self.last_clock = now
        return self.remaining(now)

    def begin_post(self, index, now):
        self.post_index = int(index)
        self.post_clock = float(now)

    def finish_post(self, index, seconds):
        index = int(index)
        if index not in self.post_done:
            n = self.frames.get(index, 0)
            seconds = float(seconds)
            if n and math.isfinite(seconds) and seconds > 0:
                observed = max(0.01, min(10.0, seconds / n))
                self.post_sec_per_frame = 0.35 * self.post_sec_per_frame + 0.65 * observed
            self.post_done.add(index)
        if self.post_index == index:
            self.post_index = None
            self.post_clock = None

    def remaining(self, now):
        """Seconds until the end of the run, or None before the first step."""
        if self.weight_done <= 0:
            return None
        total_weight = sum(map(sum, self.plan.values()))
        seconds_per_weight = self.sample_seconds / self.weight_done
        sample_left = max(0.0, total_weight - self.weight_done) * seconds_per_weight
        pending_frames = sum(n for i, n in self.frames.items() if i not in self.post_done)
        post_left = pending_frames * self.post_sec_per_frame
        if self.post_index is not None and self.post_clock is not None:
            this_clip = self.frames.get(self.post_index, 0) * self.post_sec_per_frame
            elapsed = max(0.0, float(now) - self.post_clock)
            post_left -= min(this_clip, elapsed)
        return round(max(0.0, sample_left + post_left), 1)
