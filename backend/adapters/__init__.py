"""
Adapter auto-discovery registry.

Any module in this package that defines a class inheriting from BaseAdapter
is automatically registered. To add support for a new bank, drop a .py file
into this directory — no other changes needed.
"""
from __future__ import annotations

import importlib
import inspect
import pkgutil
from pathlib import Path

from adapters.base import BaseAdapter

REGISTRY: dict[str, type[BaseAdapter]] = {}


def _discover() -> dict[str, type[BaseAdapter]]:
    registry: dict[str, type[BaseAdapter]] = {}
    package_dir = Path(__file__).parent

    for _, module_name, _ in pkgutil.iter_modules([str(package_dir)]):
        if module_name in ("__init__", "base"):
            continue
        try:
            mod = importlib.import_module(f"adapters.{module_name}")
            for _, cls in inspect.getmembers(mod, inspect.isclass):
                if issubclass(cls, BaseAdapter) and cls is not BaseAdapter and hasattr(cls, "NAME"):
                    registry[cls.NAME] = cls
        except Exception as e:
            import warnings
            warnings.warn(f"Failed to load adapter '{module_name}': {e}")

    return registry


REGISTRY = _discover()
