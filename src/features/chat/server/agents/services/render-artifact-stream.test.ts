import { describe, expect, it } from "vitest";
import {
  buildRenderArtifactEvents,
  RenderArtifactStreamParser,
} from "./render-artifact-stream";

describe("RenderArtifactStreamParser", () => {
  it("emits start, title, language, and incremental code deltas across chunks", () => {
    const parser = new RenderArtifactStreamParser("artifact-1");

    const first = parser.append(
      '{"title":"Landing","language":"react","code":"export default function App(){return <div className=\\"',
    );
    const second = parser.append('p-4 text-red-500\\">Hello</div>}"}');

    expect(first).toEqual([
      {
        type: "artifact_started",
        artifactId: "artifact-1",
        callId: "artifact-1",
      },
      { type: "artifact_title", artifactId: "artifact-1", title: "Landing" },
      {
        type: "artifact_language",
        artifactId: "artifact-1",
        language: "react",
      },
      {
        type: "artifact_code_delta",
        artifactId: "artifact-1",
        delta: 'export default function App(){return <div className="',
      },
    ]);

    expect(second).toEqual([
      {
        type: "artifact_code_delta",
        artifactId: "artifact-1",
        delta: 'p-4 text-red-500">Hello</div>}',
      },
    ]);
  });

  it("finalize backfills any missing fields and remaining code", () => {
    const parser = new RenderArtifactStreamParser("artifact-2");

    parser.append('{"title":"Only Title"');

    expect(
      parser.finalize({
        title: "Only Title",
        language: "html",
        code: '<main class="p-4">Hi</main>',
      }),
    ).toEqual([
      { type: "artifact_language", artifactId: "artifact-2", language: "html" },
      {
        type: "artifact_code_delta",
        artifactId: "artifact-2",
        delta: '<main class="p-4">Hi</main>',
      },
    ]);
  });
});

describe("buildRenderArtifactEvents", () => {
  it("creates one-shot artifact events for fully parsed args", () => {
    expect(
      buildRenderArtifactEvents("artifact-3", {
        title: "Card",
        language: "html",
        code: "<section>Hi</section>",
      }),
    ).toEqual([
      {
        type: "artifact_started",
        artifactId: "artifact-3",
        callId: "artifact-3",
      },
      { type: "artifact_title", artifactId: "artifact-3", title: "Card" },
      { type: "artifact_language", artifactId: "artifact-3", language: "html" },
      {
        type: "artifact_code_delta",
        artifactId: "artifact-3",
        delta: "<section>Hi</section>",
      },
    ]);
  });
});
