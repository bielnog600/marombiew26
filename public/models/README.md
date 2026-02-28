# 3D Models Directory

Place your GLB/GLTF fitness models here:

- `male-fitness.glb` — Male fitness model (CC-BY or CC0)
- `female-fitness.glb` — Female fitness model (CC-BY or CC0)

## Recommended Sources (CC-BY / CC0)

1. **Sketchfab** — Search for "fitness man/woman" filtered by "Downloadable" + "CC-BY" or "CC0"
   - Download as GLB format
   - Optimize with [gltf.report](https://gltf.report/) or [glTF-Transform](https://gltf-transform.dev/) if >8MB

2. **Poly Pizza** (poly.pizza) — CC0 models

3. **ReadyPlayer.me** — Generate custom avatars (check license for commercial use)

## Optimization Tips

If models are too large (>8MB):
```bash
npx @gltf-transform/cli optimize input.glb output.glb --compress draco --texture-compress webp
```

## License Attribution

Update `MODEL_CREDITS` in `src/components/BodyModel3D.tsx` with the actual author name and URL after downloading.
