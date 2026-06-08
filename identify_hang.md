# HANG IDENTIFICATION

## Facts
✅ Detections R1-R7 individually work (2.5s total)
✅ Empty candidates + rest of pipeline works (2.6s total)
✅ Minimal handlers work
✅ createClient() works
✅ All RPCs work
✅ All upserts work

❌ Original engine hangs (timeout at 60s)

## Hypothesis
The hang is in one of these:
1. The way detectOccurrences() is DEFINED (maybe closure issue)
2. The way upsertOccurrences() is DEFINED
3. The way autoResolveOccurrences() is DEFINED
4. Some interaction between these functions

## Next Test
Copy EXACT code from original engine to test engine, piece by piece, to find which component causes hang.
