# Live correction (camera)
- Keep squat rep/error rules in the pure `src/lib/liveCorrection/squatAnalysis.ts` (thresholds as exported constants) and load MediaPipe only inside the lazily imported `LiveCorrectionScreen`, so the pose library never enters the initial bundle and the rules stay testable without a camera.
- Access is gated by `students_profile.premium_camera` (admin-only, guarded by RLS plus a trigger) and `has_premium_camera()` for `camera_sessions` inserts; admins always pass so they can test via `/correcao-ao-vivo-teste`.
