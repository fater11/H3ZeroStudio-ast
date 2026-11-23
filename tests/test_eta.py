"""Low/High and post-encode ETA regression tests: no models or CUDA needed."""
from h3s import h3s_eta as eta


def test_step_weights_distinguish_low_and_high_and_scale_frames():
    assert eta.step_weights(6, 4) == (1, 1, 1, 1, 2, 2)
    assert eta.step_weights(6, None) == (1,) * 6
    assert eta.step_weights(4, 99, 0.5) == (0.5,) * 4


def test_low_high_eta_includes_unfinished_encoding():
    clock = eta.RunEta({0: eta.step_weights(6, 4), 1: eta.step_weights(6, 4)},
                       {0: 200, 1: 200}, post_sec_per_frame=0.3)
    assert clock.remaining(0) is None
    clock.begin_sample(0, 0)
    left = clock.sample_step(0, 1, 50)
    assert left == 15 * 50 + 400 * 0.3  # 4 low + 2 high count 8 weighted units per clip
    assert clock.sample_step(0, 2, 100) < left
    for step, now in ((3, 150), (4, 200), (5, 300), (6, 400)):
        clock.sample_step(0, step, now)
    after_sampling = clock.remaining(400)
    assert after_sampling > 400 * 0.3, 'ETA cannot reach zero after the last sampler step'
    clock.begin_post(0, 400)
    assert clock.remaining(420) < after_sampling
    clock.finish_post(0, 60)
    assert clock.post_sec_per_frame == 0.3
    assert clock.remaining(460) < after_sampling
    clock.begin_sample(1, 460)
    for step, now in enumerate((510, 560, 610, 660, 760, 860), start=1):
        clock.sample_step(1, step, now)
    clock.begin_post(1, 860)
    assert clock.remaining(1000) == 0
    clock.finish_post(1, 60)
    assert clock.remaining(1000) == 0


def test_eta_recalibrates_for_slower_video_postprocessing():
    tracker = eta.RunEta({0: (1,), 1: (1,)}, {0: 100, 1: 100},
                         post_sec_per_frame=0.1)
    tracker.begin_sample(0, 0)
    tracker.sample_step(0, 1, 2)
    before = tracker.remaining(2)
    tracker.begin_post(0, 2)
    tracker.finish_post(0, 100)
    assert tracker.post_sec_per_frame > 0.5
    assert tracker.remaining(102) > before - 10


def test_post_stage_eta_survives_polling_after_last_sampling_step():
    from h3s import h3s_gen as gen
    node = "eta-poll-test"
    notify = gen.Notifier(node, run_id="eta-unit")
    notify.inst = None
    try:
        notify("start", segments=1, steps_total=8)
        notify("step", seg=0, step=8, steps=8, eta=90)
        notify("phase", seg=0, phase="decode", eta=75)
        state = gen.run_status(node)
        assert state["phase"]["phase"] == "decode" and state["phase"]["eta"] == 75
        assert state["progress"]["eta"] == 90  # stale sampler state is kept separately
        notify("phase", seg=0, phase="preview", eta=45)
        notify("phase", seg=0, phase="master", eta=18)
        state = gen.run_status(node)
        assert state["phase"]["phase"] == "master" and state["phase"]["eta"] == 18
    finally:
        gen.STATUS.pop(node, None)


def test_eta_ignores_duplicate_step_events_and_post_events():
    tracker = eta.RunEta({0: (1, 2)}, {0: 20})
    tracker.begin_sample(0, 0)
    tracker.sample_step(0, 1, 5)
    elapsed = tracker.sample_seconds
    tracker.sample_step(0, 1, 10)
    assert tracker.sample_seconds == elapsed
    tracker.finish_post(0, 10)
    rate = tracker.post_sec_per_frame
    tracker.finish_post(0, 100)
    assert tracker.post_sec_per_frame == rate
