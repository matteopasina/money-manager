from types import SimpleNamespace

import pytest


@pytest.mark.parametrize(
    "model",
    ["gpt-5.6-luna", "openai/gpt-5.6-luna", "gpt-6-luna", "openai/gpt-6-luna"],
)
def test_luna_disables_reasoning_for_chat_completion_tools(client, monkeypatch, model):
    import litellm

    captured = {}

    def fake_completion(**kwargs):
        # Exercise the installed LiteLLM validation/serialization too: a mock
        # of completion alone previously missed UnsupportedParamsError.
        from litellm.utils import get_optional_params

        serialized = get_optional_params(
            model=kwargs["model"].rsplit("/", 1)[-1],
            custom_llm_provider="openai",
            reasoning_effort=kwargs.get("reasoning_effort"),
            allowed_openai_params=kwargs.get("allowed_openai_params"),
            tools=kwargs["tools"], tool_choice=kwargs["tool_choice"],
        )
        assert serialized["reasoning_effort"] == "none"
        assert serialized["tool_choice"] == "auto"
        captured.update(kwargs)
        message = SimpleNamespace(content="Done", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason="stop", message=message)])

    monkeypatch.setattr(litellm, "completion", fake_completion)

    response = client.post(
        "/api/chat",
        json={"model": model, "messages": [{"role": "user", "content": "Summarize my finances"}]},
    )

    assert response.status_code == 200
    assert captured["reasoning_effort"] == "none"
    assert captured["allowed_openai_params"] == ["reasoning_effort", "tool_choice"]
    assert captured["tools"]


def test_other_models_keep_default_reasoning_effort(client, monkeypatch):
    import litellm

    captured = {}

    def fake_completion(**kwargs):
        captured.update(kwargs)
        message = SimpleNamespace(content="Done", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason="stop", message=message)])

    monkeypatch.setattr(litellm, "completion", fake_completion)

    response = client.post(
        "/api/chat",
        json={"model": "gpt-5.5", "messages": [{"role": "user", "content": "Summarize my finances"}]},
    )

    assert response.status_code == 200
    assert "reasoning_effort" not in captured
    assert "allowed_openai_params" not in captured
