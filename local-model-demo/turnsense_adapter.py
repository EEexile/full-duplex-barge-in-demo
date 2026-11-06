"""Load the TurnSense endpoint detector."""

import sys


def load_turnsense(source, model_dir):
    # Use the published TurnSense implementation and its CMVN.
    sys.path.insert(0, str(source.resolve()))
    from infer import AudioClassifierInfer, DEFAULT_FRONTEND_CONF, LABELS, process_predictions

    model = AudioClassifierInfer(
        onnx_path=str(model_dir / "model_int8.onnx"),
        labels=LABELS,
        frontend_conf={**DEFAULT_FRONTEND_CONF, "cmvn_file": str(model_dir / "am.mvn")},
    )

    def predict(pcm):
        _, ids = process_predictions(model._run_model(pcm[-128000:]))
        return LABELS[int(ids[0])]

    return predict
