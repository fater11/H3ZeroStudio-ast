import os, sys, tempfile, torch
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from h3s_disk_chain import DiskTensorList
with tempfile.TemporaryDirectory() as d:
    x = DiskTensorList(d, 'test')
    x.append(torch.arange(6))
    x.append(None)
    x.append(torch.arange(3))
    assert len(x) == 3
    assert x.shape(0) == (6,) and x.shape(1) is None
    assert torch.equal(x[0], torch.arange(6))
    assert x[1] is None
    assert torch.equal(x[-1], torch.arange(3))
    assert len(x[:]) == 3
    x[0] = None
    assert x[0] is None and x.shape(0) is None
    x.close()
print('DISK_CHAIN_OK')


def test_rgb8_decoded_frame_scratch_is_quarter_size():
    """Compressed scratch keeps 8-bit MP4 fidelity and cleans its private files."""
    with tempfile.TemporaryDirectory() as directory:
        frames = torch.rand(19, 64, 96, 3)
        frames[0, :, :, :] = 0
        frames[-1, :, :, :] = 1
        chain = DiskTensorList(directory, "decoded_frames_test", codec="rgb8")
        private_dir = chain._tmp.name
        chain.append(frames)
        assert chain.shape(0) == tuple(frames.shape)
        assert os.path.getsize(chain._paths[0]) < frames.numel() * 2
        restored = chain[0]
        assert restored.dtype == torch.float32
        assert restored.shape == frames.shape
        assert (restored - frames).abs().max().item() <= 0.5 / 255 + 1e-5
        chain.close()
        assert not os.path.exists(private_dir)


def test_decoded_frame_scratch_rejects_non_images():
    with tempfile.TemporaryDirectory() as directory:
        chain = DiskTensorList(directory, "invalid_frames", codec="rgb8")
        try:
            try:
                chain.append(torch.ones(3, 4))
            except ValueError:
                pass
            else:
                raise AssertionError("rgb8 scratch accepted a non-image tensor")
        finally:
            chain.close()
