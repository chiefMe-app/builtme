export interface StrictReplacementStep {
  selectedObjectId: string;
  maskUrl: string;
  bbox: { x: number; y: number; width: number; height: number };
  category: string;
  renderDescription: string;
  productName: string;
}

export interface SequentialStepResult {
  selectedObjectId: string;
  imageUrl: string;
}

/**
 * Applies strict object replacements one at a time. Each step edits only its
 * masked object on the CURRENT image (composited result of the previous step),
 * so earlier edits are preserved and multiple objects can be replaced reliably.
 *
 * `runStep` is injected by the caller (it owns the fetch + polling against the
 * render / render-status routes) so this orchestration stays provider-agnostic
 * and testable. It must return the composited result URL for the step, or null
 * on failure.
 */
export async function runSequentialStrictReplacements({
  baseImageUrl,
  steps,
  runStep,
  onStepComplete,
}: {
  baseImageUrl: string;
  steps: StrictReplacementStep[];
  runStep: (step: StrictReplacementStep, inputImageUrl: string) => Promise<string | null>;
  onStepComplete?: (result: SequentialStepResult, currentImageUrl: string) => void;
}): Promise<{ finalImageUrl: string; appliedSteps: SequentialStepResult[] }> {
  let currentImageUrl = baseImageUrl;
  const appliedSteps: SequentialStepResult[] = [];

  for (const step of steps) {
    let resultUrl = await runStep(step, currentImageUrl);
    if (!resultUrl) resultUrl = await runStep(step, currentImageUrl); // retry once
    if (!resultUrl) {
      // Keep previous successful edits; skip this object
      console.error("[strict-sequential] step failed, preserving prior edits:", step.productName);
      continue;
    }
    currentImageUrl = resultUrl;
    const stepResult = { selectedObjectId: step.selectedObjectId, imageUrl: resultUrl };
    appliedSteps.push(stepResult);
    onStepComplete?.(stepResult, currentImageUrl);
  }

  return { finalImageUrl: currentImageUrl, appliedSteps };
}
