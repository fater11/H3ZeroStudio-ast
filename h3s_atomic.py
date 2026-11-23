"""Crash-resistant torch cache writes: private temporary file + atomic publication.

A process crash before os.replace leaves the previous cache entry intact.
Power-loss durability depends on filesystem and hardware guarantees.
"""
import os
import tempfile


def save_torch(obj, path):
    import torch
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.' + os.path.basename(path) + '.', suffix='.part', dir=directory)
    try:
        with os.fdopen(fd, 'wb') as f:
            torch.save(obj, f)
            f.flush()
            os.fsync(f.fileno())
        # Preserve existing destination until the new archive is fully written.
        from . import h3s_media
        h3s_media.replace_file(tmp, path)
        if os.name != 'nt':
            try:
                dfd = os.open(directory, os.O_RDONLY)
                try:
                    os.fsync(dfd)
                finally:
                    os.close(dfd)
            except OSError:
                pass
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
