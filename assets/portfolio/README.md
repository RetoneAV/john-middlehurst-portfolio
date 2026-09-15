# Portfolio assets

Each project lives in a folder named after its slug:

```
assets/portfolio/<slug>/
├── tile.<ext>     Grid / hero still
├── videos/        Project video files
└── images/        Extra stills for the project page gallery
```

| Folder | Default title |
|--------|---------------|
| `guinness-storehouse/` | Guinness Storehouse |
| `feel-the-pull/` | Feel The Pull |
| `adidas-london-marathon/` | Adidas London Marathon |
| `outernet-london/` | Outernet London |
| `immersive-dining/` | Immersive Dining |
| `control-the-swarm/` | Control The Swarm |
| `holodeck-3d-room/` | Holodeck 3D Room |
| `belstaff/` | Belstaff |
| `interactive-photobooth/` | Interactive Photobooth |
| `realtime-interactive-ai-video/` | Real-Time Interactive AI Video |
| `360-projections/` | 360 Projections |
| `gesture-control/` | Gesture Control |

Keep the tile filename as `tile` plus the original extension (`.jpeg`, `.png`, or `.jpg`). Drop extra stills into `images/` and clips into `videos/`, then point the matching project page at those files.

Recommended tile size: **1200×750** or larger, **16:10** aspect ratio. Tiles are cropped with `object-fit: cover`.
