"""Load the merged release in the server's existing Transformers runtime."""
import numpy as np
import qwen_asr  # Registers the Qwen3-ASR config, processor and model.
import torch
from transformers import AutoModel, AutoProcessor, LogitsProcessor, LogitsProcessorList


class ClassDigits(LogitsProcessor):
    def __init__(self, ids):
        self.ids = ids

    def __call__(self, input_ids, scores):
        masked = torch.full_like(scores, float("-inf"))
        masked[:, self.ids] = scores[:, self.ids]
        return masked


class JapaneseEngine:
    def __init__(self, bundle):
        self.bundle = bundle
        self.device = torch.device("cuda:0")
        self.processor = AutoProcessor.from_pretrained(bundle.model_dir, local_files_only=True)
        self.model = AutoModel.from_pretrained(
            bundle.model_dir, local_files_only=True, dtype=torch.bfloat16, attn_implementation="sdpa"
        ).thinker.to(self.device).eval()
        ids = [self.processor.tokenizer.encode(str(i), add_special_tokens=False) for i in range(3)]
        if any(len(i) != 1 for i in ids) or len({i[0] for i in ids}) != 3:
            raise RuntimeError("Expected three distinct class tokens")
        self.digits = [i[0] for i in ids]
        self.constraint = LogitsProcessorList([ClassDigits(self.digits)])

    @torch.inference_mode()
    def predict(self, audio: np.ndarray, first_frame: int, count: int):
        batch = self.processor(
            text=[self.bundle.prompt(first_frame, count)], audio=[audio], sampling_rate=16000,
            return_tensors="pt", padding=True,
        )
        inputs = {k: v.to(self.device, dtype=torch.bfloat16 if v.is_floating_point() else v.dtype)
                  for k, v in batch.items()}
        start = inputs["input_ids"].shape[1]
        output = self.model.generate(
            **inputs, do_sample=False, min_new_tokens=count, max_new_tokens=count,
            logits_processor=self.constraint, use_cache=True,
            pad_token_id=self.processor.tokenizer.pad_token_id,
        )
        return [self.digits.index(i) for i in output[0, start:].tolist()]
