# SimLab PWA — Part 1 (Clean Skeleton)
Run the server and client as described in the README section below.

http://localhost:4000/assets/test.txt // Opens URL for: Control | Learner | Stage

1. Restart both:

Server: npm run dev (watch for “Server on http://localhost:4000”)
Client: npm run dev (Vite)

2. Open these URLs in a browser:

API health → http://localhost:4000/api/health → { ok: true }
Case list → http://localhost:4000/api/cases → should be an array (possibly with your case-anemia)
Specific case → http://localhost:4000/api/case/case-anemia → JSON (if that file exists)
Static → http://localhost:4000/assets/test.txt (if you have one)

3. Control view sanity:

Load http://localhost:5173/control

The Case select should populate from /api/cases
The Assets list should load after selecting a case (or default case-anemia)
Try New (give it an id), then Save (it should appear in /api/cases)

4. Drop to Stage:

Click Drop to Stage on any asset
Stage at http://localhost:5173/stage should show it (with timestamp)
Clear Stage should wipe it

5. Learner order → Control:

In http://localhost:5173/learner, press Order CBC
Server console should log learner:order received: { code: 'CBC', by: 'Learner' }
Control should show the Pending Order; click Reveal result to drop a matching asset

*** Adding Cases and Assets ***

Click Edit Case (assets) → modal opens

Add note/lab or image/pdf/video (URL field)

Reorder ↑/↓, edit titles/content, delete

Save Changes persists to /api/case/:id (your JSON on disk)

Tip: for media, put files under server/public/assets/... and use a relative contentUrl like /assets/cases/anemia/echo.mp4.



// ------- 9/6/25 A.M. Vision Map
1. Catalog Expansion (Control → Learner)

    Keep the four master categories: Labs, Imaging, Meds, Other.

    Each has subgroups (Hematology, Chemistry, etc.), and inside those, discrete tests (CBC, ESR, CT Head).

    Control/Case Builder selects which catalog items to “activate” for the case → pushes to learners (already scaffolded in your pushedCatalog/pushedIndex work).

2. Guardrails & Justification (Policy Map)

    We already started this: policyMap[code] = "ok" | "justify" | "blocked".

    ok → goes green, order allowed, flows into Pending Orders.

    justify → goes amber, learner must type a justification (dialog box) → this goes to Requests instead of Orders.

    blocked → goes red, order not allowed (optional: still let them request with mandatory justification).

    This hits your idea exactly: they see everything, but must reason about what’s appropriate.

3. Flow on Learner Side

    Button color = policy.

    Click:

    ✅ ok → toggles into cart (green).

    ⚠ justify → popup box → learner:request event sent.

    🚫 blocked → error toast “Not indicated” or optional justification.

    Cart + submit flow is unchanged for valid items.

4. Flow on Control Side

    Pending Orders: only “ok” items.

    Learner Requests: justification-required or blocked attempts land here.

    Faculty can approve → reveal, deny, or reply.

5. Future Extensions

    Custom catalog builder (you hinted: add new CBC variants, iron panels, etc.).

    Faculty could assign per-learner role-based restrictions (Recorder only sees “Notes”, Meds/IV only sees “Meds” group).

    Analytics: track when a learner orders something unjustified → flag for debrief (“ordered ESR without reasoning”).




    // ------ Monitor Pane
    
    A) From HDMI capture (Windows / DirectShow):

        # List devices first:
            ffmpeg -list_devices true -f dshow -i dummy

        # Then replace "USB Video" with your capture device name:
            ffmpeg -f dshow -i video="USB Video" -vf fps=1 -q:v 3 -update 1 C:\monitor-feed\monitor.jpg

    B) From OBS Virtual Camera:

        # Turn on OBS Virtual Camera, then:
            ffmpeg -f dshow -i video="OBS Virtual Camera" -vf fps=1 -q:v 3 -update 1 C:\monitor-feed\monitor.jpg

    C) Tell server where to find the snapshot

        # In the server terminal session:
        $env:MONITOR_PATH = "C:\monitor-feed\monitor.jpg"



    D) Quick test checklist

        1. Start ffmpeg so it keeps updating the snapshot file.
        2. Start the server; visit http://<server>:4000/monitor.jpg — you should see the image.
        3. Open Control; the Live Monitor pane should update every ~1.5s.
        4. Click Send frame → Stage → verify it appears on Stage with the current timestamp title.