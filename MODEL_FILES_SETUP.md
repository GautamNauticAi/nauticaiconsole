# Model files for Agentic backend

## 1. Biofouling / YOLO model — you already have it

Your project already has **`best.pt`** (Prasad’s weights). That is the biofouling detection model.

The Agentic backend code currently looks for a file named **`biofouling_best.pt`**. You can:

- **Option A:** Copy (or symlink) your existing **`best.pt`** into the Agentic backend folder and name it **`biofouling_best.pt`**, or  
- **Option B:** Change the backend to use **`best.pt`** via an env var (e.g. `NAUTICAI_YOLO_PATH=path/to/best.pt`).

So you do **not** need to get a second biofouling file — **best.pt is it.**

---

## 2. Second file: SAM checkpoint — what it is and where to get it

The second file is **`sam_vit_b_01ec64.pth`**. It is **not** from Prasad.

### What it is

- **SAM** = **Segment Anything Model** (Meta/Facebook).
- The Agentic pipeline uses it **after** YOLO: YOLO finds biofouling boxes, then **SAM** segments the exact pixels inside those regions. From that, the backend computes **hull coverage %** (fouling area vs image area) and then the IMO rating (FR-0 to FR-4).
- So: **best.pt** = “where is fouling?” → **SAM** = “exactly how much of the hull is covered?”.

### Where to get it

- **Official source (Meta):**  
  **https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth**

- **Size:** about **375 MB**.

- **Download from command line (e.g. in the folder where you want the file):**
  ```bash
  # Windows (PowerShell)
  Invoke-WebRequest -Uri "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth" -OutFile "sam_vit_b_01ec64.pth"

  # Or use a browser: open the URL above and save as sam_vit_b_01ec64.pth
  ```

### Where to put it

Put **`sam_vit_b_01ec64.pth`** inside the **`sam_checkpoints`** folder of the Agentic backend:

```
AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/
├── best.pt or biofouling_best.pt   ← your existing best.pt (see above)
└── sam_checkpoints/
    └── sam_vit_b_01ec64.pth        ← download from the link above
```

Create the folder **`sam_checkpoints`** if it doesn’t exist.

---

## Summary

| File                 | What it is                         | Where you get it                                      |
|----------------------|------------------------------------|--------------------------------------------------------|
| **best.pt**          | YOLO biofouling detection (Prasad) | Already in your project                               |
| **sam_vit_b_01ec64.pth** | SAM segmentation (Meta)        | Download: https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth |

You only need to **download SAM once** from the link above; no need to get it from Prasad.
