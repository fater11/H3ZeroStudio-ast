"""Bounded-memory, disk-backed scene tensor sequence for long H3 projects."""
import os
import tempfile
import torch


class DiskTensorList:
    def __init__(self, directory, prefix, codec="raw"):
        os.makedirs(directory, exist_ok=True)
        if codec not in ("raw", "rgb8"):
            raise ValueError(f"Unsupported temporary frame codec: {codec}")
        self._codec = codec
        self._tmp = tempfile.TemporaryDirectory(prefix="h3zs_" + prefix + "_", dir=directory)
        self._paths = []
        self._shapes = []

    def append(self, tensor):
        path = os.path.join(self._tmp.name, f"{len(self._paths):06d}.pt")
        if tensor is None:
            self._paths.append(None)
            self._shapes.append(None)
            return
        cpu = tensor.detach().to("cpu")
        original_shape = tuple(cpu.shape)
        if self._codec == "rgb8":
            # Temporary decoded frames go to a normal 8-bit H.264 MP4.
            # A 4K float32 segment can occupy multiple GB on disk; keeping
            # RGB8 here cuts that by 75%, while changing pixels by <=0.5/255.
            if cpu.ndim != 4 or cpu.shape[-1] != 3 or not cpu.is_floating_point():
                raise ValueError("rgb8 disk chain expects IMAGE [F,H,W,3] float tensor")
            packed = torch.empty(original_shape, dtype=torch.uint8)
            frame_bytes = max(1, int(cpu.shape[1]) * int(cpu.shape[2]) * 3 * 4)
            batch = max(1, (64 * 1024 * 1024) // frame_bytes)
            for i in range(0, original_shape[0], batch):
                # Convert only a small block: never allocate whole-video float copies.
                block = cpu[i:i + batch].clamp(0, 1)
                block.mul_(255).add_(0.5)
                packed[i:i + batch] = block.to(torch.uint8)
            cpu = packed
        torch.save(cpu, path)
        self._paths.append(path)
        self._shapes.append(original_shape)

    def __len__(self):
        return len(self._paths)

    def _index(self, index):
        index = int(index)
        if index < 0:
            index += len(self)
        if index < 0 or index >= len(self):
            raise IndexError(index)
        return index

    def shape(self, index):
        return self._shapes[self._index(index)]

    def __getitem__(self, index):
        if isinstance(index, slice):
            return [self[i] for i in range(*index.indices(len(self)))]
        path = self._paths[self._index(index)]
        if path is None:
            return None
        data = torch.load(path, map_location="cpu", weights_only=True)
        return data.float().div_(255.0) if self._codec == "rgb8" else data

    def __setitem__(self, index, value):
        index = self._index(index)
        if value is not None:
            raise TypeError("Only releasing an entry (None) is supported")
        path = self._paths[index]
        self._paths[index] = None
        self._shapes[index] = None
        if path is not None:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass

    def __iter__(self):
        for i in range(len(self)):
            yield self[i]

    def close(self):
        self._tmp.cleanup()
