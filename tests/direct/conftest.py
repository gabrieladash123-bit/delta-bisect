import os
from pathlib import Path
import pytest
import sys

@pytest.fixture(autouse=True)
def bridge_gltest_raw_timestamp(direct_vm, monkeypatch):
    # gltest 0.29.2 warp updates VM time, but refresh only copies sender/origin.
    # Production GenVM supplies message_raw.datetime afresh on every transaction.
    original = direct_vm._refresh_gl_message
    def refresh():
        original()
        module = sys.modules.get('genlayer.gl')
        if module is not None and hasattr(module, 'message_raw'):
            module.message_raw['datetime'] = direct_vm._datetime
    monkeypatch.setattr(direct_vm, '_refresh_gl_message', refresh)

@pytest.fixture
def direct_deploy(direct_deploy):
    return lambda *args, **kwargs: direct_deploy(*args, sdk_version='v0.2.16', **kwargs)

@pytest.fixture(autouse=True)
def windows_stdin_sharing_workaround(monkeypatch):
    if os.name != 'nt':
        yield
        return
    from gltest.direct import loader
    original = loader._inject_message_to_fd0
    deferred = []
    def inject(vm):
        try: original(vm)
        except PermissionError as error:
            if error.winerror != 32: raise
            deferred.append(Path(error.filename))
    monkeypatch.setattr(loader, '_inject_message_to_fd0', inject)
    yield
    for file in deferred:
        try: file.unlink(missing_ok=True)
        except PermissionError: pass
