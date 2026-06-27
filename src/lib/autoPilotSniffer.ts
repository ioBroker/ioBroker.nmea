// Pre-parser raw-frame sniffer for autopilot-related traffic.
//
// The adapter normally only sees frames AFTER canboatjs' FromPgn parser has fully reassembled
// and decoded them. For Raymarine autopilot commands (PGN 126208 with a manufacturer-proprietary
// commanded PGN like 65345 / 65360 / 65379, or PGN 126720 Seatalk1 keystrokes), parsing can
// fail silently — fast-packet reassembly is fragile, and canboat's decoders for the proprietary
// variants don't always populate `fields`. When that happens the frame never reaches `onData`
// and the operator can't correlate "I pressed Wind +1° on the p70" with anything in the log.
//
// This helper runs BEFORE parseString so we always see the raw text frame on the bus, even if
// canboat would later drop it. Hook it from each driver's inbound path.

const ACTISENSE_AUTOPILOT_PGNS = [126208, 126720, 65345, 65359, 65360, 65379] as const;

// Actisense plaintext (NGT-1 / PICAN-M after canboatjs canbus translation):
//   "<time>,<prio>,<pgn>,<src>,<dst>,<len>,<b0>,<b1>,…"
// We just substring-match on `,<pgn>,` — robust against trailing whitespace and TP fragments.
export function isActisenseAutopilotLine(line: string): boolean {
    for (const pgn of ACTISENSE_AUTOPILOT_PGNS) {
        if (line.includes(`,${pgn},`)) {
            return true;
        }
    }
    return false;
}

// YDGW raw format (Yacht Devices YDEN / YDWG):
//   "hh:mm:ss.mmm <R|T> <canId-hex> <b0> <b1> …"
// CAN ID is 29-bit. PGN extraction uses J1939 rules (PF < 0xF0 = PDU1 destination-specific,
// PF ≥ 0xF0 = PDU2 broadcast; for PDU1 the PS byte is the destination, not part of the PGN).
function pgnFromCanId(canIdHex: string): number | null {
    const id = parseInt(canIdHex, 16);
    if (!isFinite(id) || id <= 0) {
        return null;
    }
    const pf = (id >> 16) & 0xff;
    const dp = (id >> 24) & 0x01;
    const ps = (id >> 8) & 0xff;
    if (pf < 0xf0) {
        // PDU1 — destination-specific; PGN excludes PS.
        return (dp << 16) | (pf << 8);
    }
    // PDU2 — broadcast; PGN includes PS.
    return (dp << 16) | (pf << 8) | ps;
}

export function isYdwgAutopilotLine(line: string): boolean {
    const parts = line.trim().split(/\s+/);
    // Need at least time, R/T, canId.
    if (parts.length < 3) {
        return false;
    }
    const pgn = pgnFromCanId(parts[2]);
    if (pgn == null) {
        return false;
    }
    return (ACTISENSE_AUTOPILOT_PGNS as readonly number[]).includes(pgn);
}
