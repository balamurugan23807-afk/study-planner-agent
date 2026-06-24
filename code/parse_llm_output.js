/**
 * n8n JavaScript Code node – parses and cleans LLM output.
 * 
 * Input: LLM response (may contain markdown, extra text, formatting issues)
 * Output: Cleaned JSON with keys: events, tasks, milestones
 * 
 * Usage in n8n: Place this code in a "Code" node after the LLM chain node.
 */

function cleanJson(rawOutput) {
  // Try multiple input fields (LLM models use different output field names)
  let raw = 
    rawOutput.text ||
    rawOutput.output ||
    rawOutput.response ||
    rawOutput.completion ||
    JSON.stringify(rawOutput);

  // Convert to string and trim
  raw = String(raw).trim();

  // Remove markdown code fences if present
  // Matches: ```json, ```javascript, ``` or similar
  raw = raw.replace(/^```[a-z]*\s*/i, '');
  raw = raw.replace(/\s*```$/i, '');

  // Find the first '{' and last '}' to isolate the JSON object
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(
      'Could not find a valid JSON object in LLM output. ' +
      'Expected JSON with keys: events, tasks, milestones. ' +
      'Received: ' + raw.substring(0, 200)
    );
  }

  const jsonOnly = raw.slice(firstBrace, lastBrace + 1);

  // Parse JSON with error handling
  let parsed;
  try {
    parsed = JSON.parse(jsonOnly);
  } catch (parseError) {
    // Fallback: attempt to fix common JSON issues
    // Remove trailing commas before } or ]
    const fixed = jsonOnly
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');

    try {
      parsed = JSON.parse(fixed);
    } catch (retryError) {
      throw new Error(
        'Model output is not valid JSON after cleanup. ' +
        'Extracted: ' + jsonOnly.substring(0, 300)
      );
    }
  }

  // Validate required fields and ensure arrays
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const milestones = Array.isArray(parsed.milestones) ? parsed.milestones : [];

  return {
    json: {
      events,
      tasks,
      milestones
    }
  };
}

// Main execution
try {
  return [cleanJson($json)];
} catch (error) {
  // If parsing fails completely, return the error message
  // The workflow can handle this error in a error-handling node
  throw new Error('JSON Parser Error: ' + error.message);
}