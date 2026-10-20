import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CarrierShare, { decodeSentence } from "../src/frame/CarrierShare";

/**
 * The prd-carrier-share.md §5 kit pins, run against the VENDORED copy
 * (src/frame/CarrierShare.tsx — the bytes CI hash-pins), not the kit
 * source, so drift can never silently ride past `vendor --check`.
 */

const ADDR = "a".repeat(64);

describe("CarrierShare (vendored kit copy)", () => {
  it("renders the decode sentence + content address + pin line per lane", () => {
    for (const lane of ["qr", "svg", "nsc9", "json", "stone"]) {
      const html = renderToString(
        <CarrierShare lane={lane} artifact="ART" address={ADDR} />,
      );
      expect(html).toContain(decodeSentence(lane));
      expect(html).toContain("hash-verified");
      expect(html).toContain(ADDR);
    }
  });

  it("renders the qr raster when the pod serves bytes, with the address ever the full 64hex", () => {
    const html = renderToString(
      <CarrierShare
        lane="qr"
        // (honest shape) png rides as base64 bytes the pod actually made;
        // moduleCount mirrors the door's own derivation
        png="iVBORw0KGgoAAAANSUhEUg=="
        address={ADDR}
        moduleCount={21}
      />,
    );
    expect(html).toContain("21 modules");
    expect(html).toContain(ADDR);
  });

  it("refuses an UNKNOWN lane typed (E_CARRIER_SHAPE), never guesses", () => {
    const html = renderToString(
      <CarrierShare lane="pigeon" address={ADDR} />,
    );
    expect(html).toContain("E_CARRIER_SHAPE");
    expect(html).toContain("The caller names the carrier");
    // the refusal renders and nothing decorative rides past it
    expect(html).not.toContain("data:image/png");
  });

  it("a custom plate renders through the frame honesty line (prefix/suffix verbatim)", () => {
    const html = renderToString(
      <CarrierShare
        lane="plc-press"
        artifact="FRAMED"
        address={ADDR}
        plate={{ prefix: "PLC/CASE:", suffix: ":END" }}
      />,
    );
    expect(html).toContain("PLC/CASE:");
    expect(html).toContain(":END");
    expect(html).toContain(decodeSentence("plc-press"));
  });
});
