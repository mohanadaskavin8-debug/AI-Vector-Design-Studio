# THE NEXT OWNER — Animated Short (Instagram Reel)
### Production package: shot-by-shot, generation-ready

**Format:** 9:16 vertical · 1080×1920 · 24 fps · **runtime 88–91 s** · stereo audio
**Genre:** stylized 3D animated short film (dialogue-driven comedy-drama with a warm ending)

---

## 0. What the reference video does (and what we copy in *approach*, not content)

I sampled the reference clip (86.8 s, 1:1, 576×576) one frame every 4 s (`reference-contact-sheet.jpg`). What I saw:

| Element | Reference technique | How we use it |
|---|---|---|
| Render style | Stylized Pixar-like 3D: large expressive eyes, soft skin shading, sculpted hair clumps, realistic fabric | Same level of stylization for Jason and Mr. Anderson |
| Lighting | Warm tungsten practicals, with magenta/purple accent lights at the emotional low points and soft window light at home | Warm amber for the café and the shop. Cooler teal/purple for "the problem" beats. Golden dawn for the ending |
| Pacing | A cut every 2–4 s. Comedy comes from reaction close-ups that hold for a beat | Same rhythm. 39 shots in 88 s |
| Captions | 1–3 bold uppercase words, white with a soft shadow, centred in the frame; product actions in italics (`*OPENS STORE…*`) | Same system (spec in §4) |
| Product moments | Real UI shown on a laptop or phone, POV inserts with hands in frame | UI is built as **real motion graphics** and composited, never AI-generated (that is how we avoid misspelled text) |
| Supporting cast | A friend leaning over the hero's shoulder, a nudging hand on the shoulder | Maya fills this role |
| Camera | Push-ins, OTS shots, low "hero" angles at the turning point, wide establishing shots | All of these, plus a crane pull-back for the finale |

None of the reference characters, names, sets or branding are reused.

---

## 1. Character bible (lock these first)

> **Consistency rule:** generate each character's reference sheet **once**, approve it, then attach the same 3 images (front, ¾, profile) as the character/subject reference on **every** shot. Never re-describe a character from scratch. Paste the **locked descriptor** below word for word.

### JASON (lead, buyer)
- **Locked descriptor:** `JASON: 24-year-old man, stylized 3D animated character, warm light-brown skin, short dark-brown wavy hair swept up at the front, thick expressive eyebrows, large hazel eyes, light stubble, slim athletic build, 5'10". Wears an olive-green bomber jacket over a plain white crew-neck tee, dark navy jeans, white sneakers, black smartwatch on left wrist.`
- **Personality in motion:** leans forward when excited, talks with his hands, raises one eyebrow when skeptical, rubs the back of his neck when stressed.
- **Voice:** mid-20s, bright, confident, slightly fast. Casual North American accent.
- **Wardrobe change (Scene 7 only):** the same jacket over a navy work polo with an "Anderson Plumbing" chest patch, so the transfer of ownership is visual.

### MR. ANDERSON (lead, seller), first name Walt
- **Locked descriptor:** `MR. ANDERSON: 63-year-old man, stylized 3D animated character, fair ruddy skin, kind crow's-feet wrinkles, full silver hair neatly combed back, thick silver mustache, round wire-rim glasses, sturdy broad build with a slight belly. Wears a faded denim work shirt with sleeves rolled to the forearms, a navy quilted vest with a small embroidered "Anderson Plumbing" logo, khaki work pants, brown leather boots, old steel wristwatch.`
- **Personality in motion:** slow, deliberate movements. Chuckles with his shoulders. Pats people on the back. Takes his glasses off when he gets sentimental.
- **Voice:** early 60s, warm baritone, unhurried, a little gravel, a smile you can hear.
- **Younger version (photo prop only):** same face at 33, dark-brown hair, same mustache in brown, standing in front of the shop with a hand-painted sign.

### MAYA (supporting, Jason's best friend)
- **Locked descriptor:** `MAYA: 25-year-old woman, stylized 3D animated character, deep brown skin, voluminous natural curly hair pulled into a high puff, gold hoop earrings, bright amused eyes. Wears an oversized mustard-yellow knit sweater, black jeans.`
- **Voice:** dry, teasing, quick. Gets the comedic timing.

### ROSA (supporting, Anderson's longtime employee)
- **Locked descriptor:** `ROSA: 45-year-old woman, stylized 3D animated character, olive skin, dark hair in a low bun, reading glasses on a cord, navy work polo with "Anderson Plumbing" patch, clipboard in hand.`
- **Voice:** warm, teasing, familiar with the boss.

### PRIYA SHAH, CPA (cameo, the accountant)
- **Locked descriptor:** `PRIYA: 38-year-old woman, stylized 3D animated character, South Asian, sleek black bob, tortoiseshell glasses, charcoal blazer over a cream blouse, focused calm expression.`
- **No dialogue.**

### Extras (shop)
Two technicians in navy "Anderson Plumbing" polos, one in his 20s and one in his 50s with a beard. One customer: an older woman holding a boxed faucet.

---

## 2. Environment bible (generate one still per set and reuse it as the background/style reference)

| ID | Set | Locked descriptor |
|---|---|---|
| **ENV-CAFE** | "Corner café" | Cozy independent café on a late afternoon. Exposed brick, hanging Edison bulbs, chalkboard menu (blurred), plants on shelves, a steaming espresso machine, other patrons softly out of focus, golden sun through a big street window. Jason and Maya at a small round wooden table with two lattes. |
| **ENV-HOME** | Jason's apartment, evening | Small lived-in apartment: grey couch with a throw blanket, a coffee table with takeout containers and a notebook, string lights, bookshelf, city lights through the window, a warm lamp plus cool blue laptop glow. |
| **ENV-SHOP-EXT** | Anderson Plumbing & Heating, exterior | Brick storefront on a small-town Ontario main street. Painted sign "ANDERSON PLUMBING & HEATING — EST. 1995". Two white service vans with the navy logo. A maple tree, autumn leaves, sidewalk planters. |
| **ENV-SHOP-INT** | Shop floor | Busy front counter, pegboard walls of copper fittings, shelves of boxed parts, a parts-catalogue rack, a coffee pot, a bell over the door, warm fluorescent plus window light. |
| **ENV-OFFICE** | Anderson's back office | Wood-panel office: an old desk with paper stacks, a desktop monitor, framed photos, a fishing calendar, a mug "WORLD'S OKAYEST PLUMBER", a window onto the shop floor. |
| **ENV-CPA** | CPA office | Modern bright office, glass walls, a dual-monitor desk, a plant, neat document trays, cool daylight. |

**Global look (STYLE prefix, paste at the start of every prompt):**
`STYLE: high-end stylized 3D animated feature film look, Pixar/Disney-quality character rendering, subsurface skin scattering, expressive large eyes, detailed hair and fabric, physically based lighting, cinematic shallow depth of field, soft film grain, 24fps, vertical 9:16 composition with subject in the central safe area, no text, no watermark, no subtitles.`

**Negative prompt (all shots):** `text, letters, captions, watermark, logo artifacts, extra fingers, deformed hands, distorted face, character inconsistency, different hairstyle, different clothing, photorealistic human, low poly, flicker, morphing, jitter`

---

## 3. Recommended pipeline

1. **Character & set sheets:** Midjourney / Flux / GPT-image → turnarounds (front, ¾, profile) plus 4 expressions each. Approve them, then freeze.
2. **Keyframe first, animate second:** for every shot, make a 9:16 **start frame** with the character and set references, then image-to-video. This is the single biggest lever for consistency.
3. **Video generation:** Veo 3.x, Kling (2.x+, with Elements/character reference), or Runway Gen-4 References. Use the version that is current when you produce. Pick one tool for all character shots so the render style matches.
4. **Dialogue & lip sync:** either (a) native audio generation in Veo 3.x with the exact line in quotes, or (b) record or generate VO first (ElevenLabs, one fixed voice per character), then lip-sync (Kling Lip Sync / Hedra / Sync Labs). Option (b) gives more control and the voices stay identical across shots. Recommended.
5. **UI screens (Scenes 2, 4, 5, 6):** build as real screen designs in Figma, animate them in After Effects / Jitter / Rive, and **composite onto the laptop/phone screen** (track a green-screen plate, or generate the device with a blank glowing screen). Never let the AI model render UI text.
6. **Music:** licensed library track or Suno/Udio custom, following the cue sheet in §6.
7. **Edit:** Premiere / DaVinci / CapCut. Add captions (§4), SFX, mix to −14 LUFS for Instagram.
8. **Export:** H.264, 1080×1920, 24 fps, 15–20 Mbps, AAC 320 kbps.

---

## 4. Caption & on-screen text system

- **Spoken-word "punch" captions (matching the reference):** 1–3 words max, uppercase, white, heavy rounded sans (e.g. *Montserrat ExtraBold* / *Poppins Black*), 72–88 px, soft 30% black shadow, centred around 60% frame height. They pop in with a 4-frame scale bounce (90%→105%→100%).
- **Full accessibility subtitles:** sentence case, 44 px, white on a 50% black rounded pill, bottom safe area (above the 320 px IG UI zone). Burn in **both** layers or only the punch layer, depending on your brand preference. The full-subtitle text = the **Dialogue** field of each shot.
- **Action captions:** italic, uppercase, in asterisks, the reference's signature (`*OPENS NEXT OWNER*`).
- **Safe zones:** keep faces and text between y = 250 px and y = 1500 px. IG overlays the top 220 px and the bottom ~380 px.
- **Spell-check every UI and caption string against §7 before export.**

---

## 5. SHOT LIST

Timecodes are cumulative. Each **Prompt** = `STYLE prefix` + the shot prompt below + the locked character/environment descriptors referenced, plus the reference images attached.

---

### SCENE 1 — THE DREAM (00:00–00:14) · *Music: light, plucky acoustic guitar + soft brushed drums*

#### 1A · 00:00.0–00:02.0 · 2.0 s
- **Characters:** Jason, Maya (small in frame)
- **Environment:** ENV-CAFE, golden hour
- **Camera:** Wide establishing shot through the café window from the street. Slow dolly push through the window glass into the interior (glass-pass transition).
- **Action/expression:** Jason and Maya laughing mid-conversation at the window table. Steam rises from the lattes.
- **Dialogue:** none
- **SFX:** street ambience (light traffic, a distant bike bell) → muffled café murmur, espresso machine hiss, cups clinking
- **Transition:** continuous push-in → hard cut
- **Prompt:** `Wide exterior shot looking through a large café window at golden hour, slow dolly push forward through the glass into a cozy independent café with exposed brick and Edison bulbs. At a small round wooden table by the window sit JASON and MAYA laughing together, two lattes steaming. Warm sunlight, lens reflections on the glass, patrons softly blurred.`

#### 1B · 00:02.0–00:04.5 · 2.5 s
- **Characters:** Maya (speaking), Jason (back of shoulder)
- **Camera:** Over-the-shoulder from behind Jason onto Maya, medium close-up, slight handheld float
- **Action/expression:** Maya stirs her latte, tilts her head with a curious half-smile.
- **Dialogue:** **MAYA:** "So, what's next for you?"
- **Caption punch:** `WHAT'S NEXT?`
- **SFX:** spoon clinking in the cup
- **Transition:** cut on the dialogue
- **Prompt:** `Over-the-shoulder medium close-up from behind JASON's left shoulder (olive bomber jacket in soft focus) onto MAYA, who stirs her latte with a spoon, tilts her head and asks a question with a curious playful half-smile, natural lip movement. Warm café background with bokeh Edison bulbs.`

#### 1C · 00:04.5–00:07.0 · 2.5 s
- **Characters:** Jason
- **Camera:** Close-up, slow push-in, eye level
- **Action/expression:** He pauses and looks off to the side as if seeing the future, then a confident, slightly sheepish grin as he says it.
- **Dialogue:** **JASON:** "Honestly? I want to own a business."
- **Caption punch:** `OWN A BUSINESS`
- **SFX:** café murmur dips slightly (subjective focus); music adds a soft glockenspiel note
- **Transition:** cut
- **Prompt:** `Close-up of JASON at a café table, slow push-in. He glances off to the side dreamily, then looks back with a confident, slightly sheepish grin and speaks, natural lip sync, eyebrows lifting. Warm golden window light on one side of his face, café bokeh behind.`

#### 1D · 00:07.0–00:09.0 · 2.0 s
- **Characters:** Maya
- **Camera:** Medium close-up, static
- **Action/expression:** She leans back, one eyebrow raised, and shrugs with her mug in her hand.
- **Dialogue:** **MAYA:** "Why don't you just start one?"
- **Caption punch:** `JUST START ONE?`
- **SFX:** chair creak
- **Transition:** cut
- **Prompt:** `Medium close-up of MAYA leaning back in a café chair holding her latte, one eyebrow raised skeptically, small shrug, speaking with natural lip sync. Warm café background.`

#### 1E · 00:09.0–00:13.0 · 4.0 s
- **Characters:** Jason (Maya OTS)
- **Camera:** Reverse OTS from behind Maya onto Jason. He leans forward into a tighter frame as the camera eases in.
- **Action/expression:** Jason leans in, taps the table for emphasis, and lifts his hands as if to say "it's obvious." A knowing smile.
- **Dialogue:** **JASON:** "Why start from zero when there are thousands of established businesses already out there?"
- **Caption punch:** `WHY START FROM ZERO?` → `THOUSANDS ALREADY EXIST`
- **SFX:** two finger taps on wood
- **Transition:** match action: he reaches down and the cut lands on the laptop lid
- **Prompt:** `Over-the-shoulder shot from behind MAYA's curly hair onto JASON, who leans forward across the café table, taps the table with two fingers and gestures with open hands as he makes a persuasive point, knowing smile, animated eyebrows, natural lip sync. Camera eases in slowly. Warm golden light.`

#### 1F · 00:13.0–00:14.0 · 1.0 s
- **Characters:** Jason's hands
- **Camera:** Top-down insert, macro
- **Action:** Hands flip open a silver laptop. Blue screen glow blooms over his face (seen at the frame edge).
- **Dialogue:** none · **Action caption:** `*OPENS LAPTOP*`
- **SFX:** laptop hinge click, soft startup chime (custom, not an OS sound)
- **Transition:** **screen-glow wipe**: the glow fills the frame → Scene 2
- **Prompt:** `Top-down macro insert of JASON's hands (olive jacket cuffs, black smartwatch) opening a silver laptop on a wooden café table next to a latte. The screen lights up with a soft blue glow that blooms toward the camera. Shallow depth of field.`

---

### SCENE 2 — THE PROBLEM (00:14–00:27.5) · *Music: strips back to a ticking pizzicato + low synth pad: tension with a comedic undertone*

#### 2A · 00:14.0–00:16.0 · 2.0 s
- **Characters:** none (screen POV)
- **Environment:** laptop screen (composited UI: a generic, **unbranded** marketplace, "Business Listings")
- **Camera:** POV over the screen, trackpad scroll
- **Action:** Listing cards scroll past: "Coffee Roastery", "Landscaping Co.", "Dental Lab", "Fitness Studio", each with a price.
- **Dialogue:** none
- **SFX:** trackpad swipes, soft scroll ticks
- **Transition:** scroll stops → cut
- **Prompt (device plate only):** `Over-the-shoulder POV of a silver laptop on a café table, screen glowing plain white (for UI compositing), JASON's hand moving two fingers on the trackpad. Warm café bokeh around the screen edges.` → **UI comp:** animated scrolling grid (see §7, UI-1).

#### 2B · 00:16.0–00:18.5 · 2.5 s
- **Characters:** Jason
- **Camera:** Close-up from the laptop's POV (screen light on his face)
- **Action/expression:** His eyes widen and he nods slowly, impressed, lips pursed: "ooh." He clicks.
- **Dialogue:** **JASON:** "This actually looks pretty good."
- **On screen (comp):** listing card "Established HVAC & Plumbing Services · Asking $750,000 · Revenue $1.4M · Profit $260K"
- **Caption punch:** `$750,000`
- **SFX:** a single trackpad click on "good"
- **Transition:** click → UI zoom-in transition
- **Prompt:** `Close-up of JASON lit by cool blue laptop glow in a warm café, his eyes widen, he nods slowly with impressed pursed lips, then speaks with natural lip sync and clicks the trackpad. Shot from the laptop screen's point of view.`

#### 2C · 00:18.5–00:21.5 · 3.0 s
- **Characters:** Jason
- **Camera:** Slow push-in, slightly Dutch angle; the colour grade cools toward teal/purple
- **Action/expression:** The excitement fades. He squints, leans closer, and tilts his head. One eyebrow climbs. He rubs the back of his neck.
- **Dialogue:** **JASON:** "But how do I know these numbers are real?"
- **Insert (0.7 s, comp):** zoom on the listing's small grey tag "Figures provided by seller" (not "fake", just unverified)
- **Caption punch:** `ARE THESE REAL?`
- **SFX:** music drops out to a single low "bwomp" bass hit; an exaggerated eyebrow "squeak" foley (very subtle, comedic)
- **Transition:** cut
- **Prompt:** `Close-up of JASON leaning toward his laptop, squinting suspiciously, head tilted, one eyebrow rising high, then rubbing the back of his neck in frustration, speaking with natural lip sync. Slow push-in, slight Dutch angle, cooler teal-purple light from the screen replacing the warm café tones.`

#### 2D · 00:21.5–00:23.5 · 2.0 s
- **Characters:** Maya, Jason
- **Camera:** Two-shot. Maya leans into frame over his shoulder (the reference's "friend over shoulder" beat).
- **Action/expression:** Maya pops in, chin almost on his shoulder, chewing a croissant, a breezy grin.
- **Dialogue:** **MAYA:** "Can't you just trust the seller?"
- **Caption punch:** `JUST TRUST THEM?`
- **SFX:** croissant crunch
- **Transition:** cut
- **Prompt:** `Two-shot: JASON sits looking at his laptop as MAYA leans in over his shoulder from behind, chewing a croissant, breezy carefree grin, speaking with natural lip sync. Warm café background.`

#### 2E · 00:23.5–00:27.5 · 4.0 s
- **Characters:** Jason (Maya soft in the background)
- **Camera:** Slow turn: Jason turns his head toward Maya/camera. Medium close-up, static, comedic deadpan hold.
- **Action/expression:** A long flat stare, then he says the line in deadpan. On the final word he closes the laptop halfway. Maya freezes mid-chew, eyes darting.
- **Dialogue:** **JASON:** "I'm not putting hundreds of thousands of dollars into something I can't verify."
- **Caption punch:** `HUNDREDS OF THOUSANDS` → `CAN'T VERIFY`
- **SFX:** silence → a slow laptop half-close creak; a tiny "gulp" from Maya
- **Transition:** **match cut**: Jason's half-closed laptop → Mr. Anderson's hand setting down a framed photograph (Scene 3). Music shifts.
- **Prompt:** `Medium close-up of JASON slowly turning his head to give a long flat deadpan stare, then speaking firmly with natural lip sync and slowly half-closing his laptop. In soft focus behind him MAYA freezes mid-chew with wide darting eyes. Comedic held beat. Cool screen light mixed with warm café light.`

---

### SCENE 3 — THE OTHER SIDE OF THE STORY (00:27.5–00:45.0) · *Music: warm, nostalgic piano + soft strings, slightly melancholic*

#### 3A · 00:27.5–00:29.5 · 2.0 s
- **Environment:** ENV-SHOP-EXT, crisp autumn morning
- **Camera:** Wide establishing crane-down from the maple leaves to the storefront sign
- **Action:** A van pulls out. A technician waves. Leaves drift down.
- **Dialogue:** none · **Location caption (small, top):** `Hamilton, Ontario` (optional)
- **SFX:** van engine, door slam, bird chirps, rustling leaves
- **Transition:** cut
- **Prompt:** `Wide establishing shot, camera cranes down through orange maple leaves to reveal a charming brick plumbing shop storefront on a small-town Ontario main street on a crisp autumn morning, two white service vans with navy logos parked out front, one pulling away while a technician in a navy polo waves. Warm morning sunlight, drifting leaves. Sign area left plain for compositing.` → **Comp the sign:** `ANDERSON PLUMBING & HEATING · EST. 1995`

#### 3B · 00:29.5–00:31.5 · 2.0 s
- **Characters:** Rosa, technicians, customer
- **Environment:** ENV-SHOP-INT
- **Camera:** Smooth Steadicam glide through the shop floor
- **Action:** The bell over the door rings. Rosa hands the customer a boxed faucet with a smile. A technician loads copper fittings into a bin. Another laughs on the phone.
- **Dialogue:** (background walla) **ROSA:** "There you go, Mrs. Patel!"
- **SFX:** door bell, register beep, clinking copper, phone ring, laughter
- **Transition:** glide continues → reveals the office window → cut inside
- **Prompt:** `Smooth Steadicam glide through a busy, lived-in plumbing supply shop: pegboard walls of copper fittings, shelves of boxed parts, a bell over the door. ROSA at the front counter hands a boxed faucet to a smiling older female customer. Technicians in navy polos sort parts and laugh. Warm window light mixed with soft fluorescents.`

#### 3C · 00:31.5–00:34.0 · 2.5 s
- **Characters:** Mr. Anderson
- **Environment:** ENV-OFFICE
- **Camera:** Slow push-in, medium close-up → **insert** of the photo in his hands
- **Action/expression:** He holds an old framed photo, takes off his glasses, and smiles softly with a nostalgic, faraway look. His thumb brushes the frame.
- **Insert (1 s):** photo of young Anderson (33) in front of the freshly painted shop, 1995 colour-fade film look
- **Dialogue:** none
- **SFX:** quiet room tone, distant shop murmur through the glass, the frame's soft tap on the desk
- **Transition:** knock on the door frame → cut
- **Prompt:** `Medium close-up, slow push-in: MR. ANDERSON sits at his cluttered wood-panelled office desk holding an old framed photograph, takes off his round wire-rim glasses and smiles softly with a nostalgic faraway look, thumb brushing the frame. Warm lamp light, window behind him to the busy shop floor.` · **Insert prompt:** `Close-up of a faded 1990s colour photograph in a wooden frame held by weathered hands: a 33-year-old version of MR. ANDERSON with dark-brown hair and brown mustache, proudly standing in front of a newly painted plumbing shop storefront.`

#### 3D · 00:34.0–00:37.5 · 3.5 s
- **Characters:** Rosa (doorway), Anderson (foreground)
- **Camera:** OTS from behind Anderson onto Rosa leaning in the doorway
- **Action/expression:** Rosa knocks twice on the frame, clipboard on her hip, a teasing, affectionate smirk.
- **Dialogue:** **ROSA:** "Boss, you've been doing this for 30 years. When are you finally retiring?"
- **Caption punch:** `30 YEARS` → `RETIRING?`
- **SFX:** two knocks on wood
- **Transition:** cut
- **Prompt:** `Over-the-shoulder from behind MR. ANDERSON's silver hair and navy vest onto ROSA leaning in the office doorway with a clipboard on her hip, knocking twice on the frame, teasing affectionate smirk, speaking with natural lip sync. Busy shop floor softly blurred behind her.`

#### 3E · 00:37.5–00:41.0 · 3.5 s
- **Characters:** Anderson
- **Camera:** Medium close-up, static, warm
- **Action/expression:** A big belly laugh with his shoulders bouncing, then he settles. His smile turns sincere and a little wistful as he glances at the photo.
- **Dialogue:** **MR. ANDERSON:** *(laughs)* "That's the plan. I just need to find someone who can take care of what I've built."
- **Caption punch:** `THAT'S THE PLAN` → `WHAT I'VE BUILT`
- **SFX:** chair creak as he leans back
- **Transition:** he turns to his monitor → cut
- **Prompt:** `Medium close-up of MR. ANDERSON laughing heartily, shoulders bouncing, then settling into a sincere, slightly wistful smile as he glances down at an old photograph and speaks with natural lip sync. Warm lamp light, cozy office.`

#### 3F · 00:41.0–00:42.5 · 1.5 s
- **Characters:** none (monitor POV) + Anderson reaction
- **Camera:** Fast montage: 3 message pop-ups (0.4 s each), then a 0.3 s reaction close-up
- **On screen (comp, see UI-2):**
  - "Would you take $50K cash today?"
  - "Is it still available??"
  - "Can you finance 100% of it for me?"
- **Action/expression:** Anderson peers over his glasses: an unimpressed blink.
- **SFX:** three escalating notification dings; a comedic flat "bonk"
- **Transition:** cut
- **Prompt (reaction):** `Close-up of MR. ANDERSON peering over his round glasses at a computer monitor, blinking slowly, completely unimpressed, lit by screen glow.`

#### 3G · 00:42.5–00:45.0 · 2.5 s
- **Characters:** Anderson
- **Camera:** Wide from the doorway. He is small in the frame, lonely in his office, with the busy shop through the window.
- **Action/expression:** A long sigh. He takes off his glasses and pinches the bridge of his nose.
- **Dialogue:** **MR. ANDERSON:** "Finding the right buyer shouldn't be this difficult."
- **Caption punch:** `SHOULDN'T BE THIS HARD` *(full subtitle keeps "this difficult")*
- **SFX:** long sigh; music resolves on a soft unresolved chord
- **Transition:** **split-screen wipe**: frame splits vertically. Left: Anderson sighing. Right: Jason at home sighing the same way, at the same moment. Hold 0.5 s, then slide to Jason → Scene 4. *(This shows that the buyer and the seller have the same problem.)*
- **Prompt:** `Wide shot from the office doorway: MR. ANDERSON small in frame at his desk, sighing deeply, removing his glasses and pinching the bridge of his nose, speaking with natural lip sync. Through the window behind him the shop bustles warmly. Bittersweet lighting.`

> Running time check: Scene 3 ends at **00:45.0**.

---

### SCENE 4 — THE SOLUTION (00:45.0–00:57.0) · *Music: playful build, light synth arpeggio + claps, curiosity*

#### 4A · 00:45.0–00:47.5 · 2.5 s
- **Characters:** Jason (on the couch), Maya (doorway, holding takeout)
- **Environment:** ENV-HOME, evening
- **Camera:** Medium-wide. Jason slumped on the couch in the foreground; Maya leans in the doorway behind.
- **Action/expression:** Jason is face-down into a cushion, laptop on his knees. Maya, holding a takeout bag, says the line casually.
- **Dialogue:** **MAYA:** "Have you tried Next Owner?" · **JASON** *(muffled, lifting his head)*: "What's that?"
- **Caption punch:** `NEXT OWNER?`
- **SFX:** paper bag rustle, city ambience through the window, couch squeak
- **Transition:** cut
- **Prompt:** `Medium-wide shot of a cozy lived-in apartment at evening: JASON slumped face-first into a grey couch cushion with a laptop on his knees, string lights and city lights in the window. MAYA leans in the doorway behind holding a takeout bag and speaks casually. JASON lifts his head with messy hair and a confused look, both with natural lip sync.`

#### 4B · 00:47.5–00:50.0 · 2.5 s
- **Characters:** Maya, Jason
- **Camera:** Two-shot. Maya plops down next to him and taps his laptop.
- **Action/expression:** She grins with confidence. He looks at her sideways, curious, eyebrow up.
- **Dialogue:** **MAYA:** "It's a smarter way to find and acquire businesses."
- **Caption punch:** `A SMARTER WAY`
- **SFX:** couch cushion poof, fingernail tap on the laptop
- **Transition:** cut on the tap
- **Prompt:** `Two-shot on a grey couch: MAYA plops down next to JASON and confidently taps the edge of his laptop while speaking with natural lip sync. JASON looks at her sideways with one curious raised eyebrow. Warm lamp light and cool laptop glow.`

#### 4C · 00:50.0–00:51.0 · 1.0 s
- **Camera:** Hero low angle up at Jason's face over the laptop. The light shifts to a clean brand-colour glow.
- **Action/expression:** His eyes light up. A slow, intrigued smile.
- **Action caption:** `*OPENS NEXTOWNER*` *(use the real URL format if desired, e.g. `*OPENS NEXTOWNER.COM*`; confirm the domain)*
- **SFX:** soft whoosh + brand sonic "shimmer"
- **Transition:** push into the screen → UI
- **Prompt:** `Low-angle hero close-up looking up at JASON over the top of his laptop screen, a clean bright glow washing over his face, eyes lighting up, slow intrigued smile. Background softly dark with string lights.`

#### 4D · 00:51.0–00:54.5 · 3.5 s
- **Camera:** Alternating 0.5 s macro of the keyboard + POV of the AI search bar (UI-3)
- **On screen (types on, then auto-fits across 3 lines):**
  `Find me an established plumbing business in Ontario, under $1 million, generating at least $200,000 in annual profit.`
- **Dialogue:** **JASON** *(muttering as he types, optional)*: "Plumbing… Ontario… under a million…"
- **SFX:** crisp mechanical keyboard typing, enter-key thunk
- **Transition:** enter → UI "thinking" animation
- **Prompt (keyboard macro):** `Macro close-up of fingers typing quickly on a silver laptop keyboard, shallow depth of field, cool screen glow, black smartwatch on the wrist.`

#### 4E · 00:54.5–00:57.0 · 2.5 s
- **Camera:** UI full screen (UI-4), then a 0.5 s cut back to Jason leaning in
- **On screen:** "Searching listings…" → filters animate in as chips (`Plumbing` `Ontario` `Under $1M` `$200K+ profit`) → a match card glides up:
  **"Anderson Plumbing & Heating · Hamilton, ON · Est. 1995 · Asking $890,000 · Annual profit $240,000"** → cursor clicks
- **SFX:** soft data ticks, rising shimmer, a satisfying "pop" when the card lands, click
- **Transition:** the card expands to full screen → Scene 5
- **Prompt (reaction):** `Close-up of JASON leaning toward his laptop, eyes reflecting light, mouth slightly open in anticipation, cool brand-colour glow.`

---

### SCENE 5 — THE TRUST FACTOR (00:57.0–01:07.5) · *Music: builds with pulsing synths + strings, satisfying "click-into-place" percussion*

> **Accuracy note:** this scene shows the review on **this listing**, as a status the listing displays. Wording such as "This listing's financials have been reviewed" is used, never "All listings verified." **Before release, confirm with Next Owner which of these steps exist on the platform (AI document analysis, CPA review), and adjust the labels to match the real feature names.** If CPA review is an optional add-on, show it as such (see the disclaimer in 5D).

#### 5A · 00:57.0–00:59.5 · 2.5 s
- **Camera:** UI full screen (UI-5), slow parallax depth
- **On screen:** listing page. A section titled "Financial Review" opens. Document icons drop into place with a light 3D tilt: `2023 Financial Statements` · `2024 Financial Statements` · `Tax Returns` · `Bank Statements`. Each shows an "Uploaded by seller" label.
- **SFX:** paper-flutter whooshes, soft "thup" as each lands
- **Transition:** a scanning beam sweeps across → 5B

#### 5B · 00:59.5–01:02.0 · 2.5 s
- **Camera:** UI macro, zooming along the data rows
- **On screen:** AI analysis. Two columns (`Listed revenue` vs `Supporting documents`) with values aligning: `$1,412,000` ↔ `$1,412,000`. A subtle line connects them and turns green. Progress text: "Comparing reported figures with supporting documents…"
- **SFX:** data ticking, a soft chime when the values align
- **Transition:** a "Sent for accountant review" badge flies off-screen → cut to the CPA

#### 5C · 01:02.0–01:04.0 · 2.0 s
- **Characters:** Priya Shah, CPA
- **Environment:** ENV-CPA
- **Camera:** OTS from behind Priya onto her dual monitors, then a quick cut to a close-up of her nodding and clicking "Approve"
- **Action/expression:** She scrolls through the statements, tilts her glasses, gives a small satisfied nod, and clicks.
- **SFX:** mouse clicks, office ambience, a crisp approval "ding"
- **Transition:** the approval tick morphs into the checklist on Jason's screen
- **Prompt:** `Over-the-shoulder shot from behind PRIYA, a CPA in a charcoal blazer with a sleek black bob, reviewing financial statement documents on dual monitors in a bright modern glass office (screens glowing white for compositing). Then close-up: she adjusts her tortoiseshell glasses, gives a small satisfied nod and clicks the mouse decisively. Cool daylight.`

#### 5D · 01:04.0–01:05.5 · 1.5 s
- **Camera:** UI full screen (UI-6). Checklist items tick in one after another (0.3 s each):
  - ✓ Financial documentation reviewed
  - ✓ CPA verification completed
  - ✓ Business performance analyzed
  - ✓ Acquisition opportunity available
- **Small footer text (legible, 28 px):** `Review status shown for this listing. Verification availability varies by listing.`
- **SFX:** four ascending "tick" chimes, a musical run
- **Transition:** reflection of the checklist in Jason's eyes → cut

#### 5E · 01:05.5–01:07.5 · 2.0 s
- **Characters:** Jason
- **Camera:** Fast push-in to a close-up, low hero angle
- **Action/expression:** A huge grin, a fist pump, and he points at the screen. Pure Pixar joy.
- **Dialogue:** **JASON:** "Now THIS is what I'm talking about."
- **Caption punch:** `NOW THIS!`
- **SFX:** music hits a big upbeat downbeat
- **Transition:** whip pan right → Scene 6
- **Prompt:** `Low-angle close-up, fast push-in: JASON on his couch breaks into a huge excited grin, pumps his fist and points at his laptop screen, speaking enthusiastically with natural lip sync, eyes sparkling with reflected screen light.`

---

### SCENE 6 — THE CONNECTION (01:07.5–01:18.5) · *Music: warm, hopeful, acoustic guitar returns over the strings*

#### 6A · 01:07.5–01:09.0 · 1.5 s
- **Characters:** Anderson
- **Environment:** ENV-OFFICE, next day
- **Camera:** Insert on a phone on the desk lighting up (UI-7), then a tilt up to Anderson picking it up
- **On screen (notification):** `Next Owner · A qualified buyer is interested in Anderson Plumbing & Heating`
- **SFX:** notification chime (the same brand sound as earlier → an audio link between the two stories)
- **Prompt:** `Insert of a smartphone lighting up on a cluttered wooden office desk next to a "WORLD'S OKAYEST PLUMBER" mug, screen glowing for compositing. MR. ANDERSON's weathered hand picks it up, tilt up to his face as he puts on his glasses to read.`

#### 6B · 01:09.0–01:10.5 · 1.5 s
- **Characters:** Anderson
- **Camera:** Close-up
- **Action/expression:** He reads, his eyebrows rise, and a slow relieved smile grows under the mustache. He leans back.
- **Dialogue:** **MR. ANDERSON:** "Finally. Someone serious."
- **Caption punch:** `FINALLY.`
- **Transition:** **split-screen** (mirroring 3G, now hopeful): Anderson on the left smiling at his phone; Jason on the right clicking `Request a meeting` → confirmation `Meeting confirmed · Thursday 10:00 AM`. Then cut.
- **Prompt:** `Close-up of MR. ANDERSON reading his phone through round glasses, eyebrows rising, a slow relieved smile growing beneath his silver mustache, leaning back in his chair, speaking with natural lip sync. Warm office light.`

#### 6C · 01:10.5–01:11.5 · 1.0 s
- **Characters:** Jason (right half of the split), wearing the same outfit
- **Action:** He clicks the button and nods to himself, determined.
- **SFX:** click + confirmation chime
- **Prompt:** `Medium close-up of JASON on his couch clicking a trackpad decisively and nodding to himself with a determined smile, laptop glow.`

#### 6D · 01:11.5–01:14.0 · 2.5 s
- **Characters:** Jason, Anderson, Rosa and technicians in the background
- **Environment:** ENV-SHOP-INT
- **Camera:** Tracking side shot as they walk along the counter. Jason looks around in awe and runs a hand along the worn wooden counter.
- **Dialogue:** **JASON:** "You've built something incredible here."
- **Caption punch:** `SOMETHING INCREDIBLE`
- **SFX:** footsteps on old wooden floor, shop ambience, door bell
- **Prompt:** `Side tracking shot inside a warm busy plumbing supply shop: JASON and MR. ANDERSON walk side by side along a worn wooden counter. JASON looks around in genuine awe, runs his hand along the counter and speaks with natural lip sync. ROSA and technicians work in the background. Warm morning light through the front windows.`

#### 6E · 01:14.0–01:17.0 · 3.0 s
- **Characters:** Anderson
- **Camera:** OTS from behind Jason onto Anderson, who stops and looks around his shop
- **Action/expression:** He pats the counter. His proud eyes go glassy for a beat, then he looks back at Jason, sizing him up kindly.
- **Dialogue:** **MR. ANDERSON:** "Thirty years of hard work. I'm just looking for the right person to take it forward."
- **Caption punch:** `THIRTY YEARS` → `THE RIGHT PERSON`
- **SFX:** two palm pats on the wood; music swells softly
- **Prompt:** `Over-the-shoulder from behind JASON onto MR. ANDERSON standing at the shop counter, patting the worn wood fondly, eyes slightly glassy with pride, then looking back at JASON with a kind, evaluating gaze, speaking with natural lip sync. Warm golden light.`

#### 6F · 01:17.0–01:19.5 · 2.5 s
- **Characters:** Jason, Anderson
- **Camera:** Reverse on Jason (1.2 s), then a **low-angle two-shot of the handshake in slight slow motion** (1.3 s). Rosa smiles in the background.
- **Action/expression:** Jason, sincere and humble, smiles. Anderson extends his hand and they shake firmly. Anderson adds a second hand on top (the "grandpa handshake").
- **Dialogue:** **JASON:** "I think I might be that person."
- **Caption punch:** `THAT PERSON.`
- **SFX:** handshake clap, music lands on a warm major chord
- **Transition:** **time-skip dissolve**: shop interior → dawn exterior
- **Prompt:** `Low-angle two-shot in slight slow motion inside a warm plumbing shop: JASON, sincere and humble, smiles and shakes hands firmly with MR. ANDERSON, who places his second hand on top warmly. ROSA smiles in the softly blurred background. Golden light flare.`

---

### SCENE 7 — THE EMOTIONAL ENDING (01:19.5–01:28.0) + END CARD · *Music: full uplifting emotional build (piano + strings + warm drums), peak at the logo*

#### 7A · 01:19.5–01:22.0 · 2.5 s
- **Characters:** Anderson, Jason (Jason now in the Anderson Plumbing polo under his bomber)
- **Environment:** ENV-SHOP-EXT, dawn: pink-gold sky, steam from a coffee cup
- **Camera:** Insert close-up of the keys passing from hand to hand (brass key ring with a worn leather tag "SHOP"), then a tilt up to a two-shot
- **Action/expression:** Anderson presses the keys into Jason's palm and closes Jason's fingers around them with both hands. Misty-eyed, smiling.
- **Dialogue:** **MR. ANDERSON:** "Take good care of her." · **JASON** *(smiles, nods)*: "I will."
- **Caption punch:** `TAKE GOOD CARE OF HER` → `I WILL.`
- **SFX:** keys jingling, morning birds, quiet street
- **Prompt:** `Dawn outside a brick plumbing shop, pink-gold sky. Close-up of weathered hands pressing a brass key ring with a worn leather tag into a young man's palm and closing his fingers around it, then tilt up to a two-shot: MR. ANDERSON misty-eyed and smiling speaks softly; JASON (white tee now replaced by a navy work polo under his olive bomber jacket) smiles and nods, both with natural lip sync.`

#### 7B · 01:22.0–01:24.0 · 2.0 s
- **Characters:** Jason, Rosa, technicians
- **Camera:** From inside the shop looking out through the glass door: Jason unlocks it, flips the sign, and steps in. The team behind the camera greets him.
- **Action/expression:** A deep breath and a proud smile. Rosa raises her coffee mug.
- **Dialogue:** **ROSA:** "Morning, boss!" *(the same nickname she used for Anderson → the torch is passed)*
- **SFX:** key in the lock, deadbolt clack, door bell, footsteps; **VO begins:** "Every business has a story."
- **Prompt:** `From inside a plumbing shop looking out through the glass front door at dawn: JASON unlocks the door, flips the hanging sign, steps inside with a deep breath and a proud smile, as ROSA and two technicians in navy polos greet him warmly, ROSA raising her coffee mug.`

#### 7C · 01:24.0–01:26.0 · 2.0 s
- **Characters:** Anderson
- **Camera:** Wide, static. Anderson walks away down the leafy sidewalk toward a vintage pickup truck with a fishing rod and tackle box in the bed. He turns back once and waves.
- **Action/expression:** A light, happy stride. He puts on a fishing cap.
- **VO:** "Every entrepreneur has a dream."
- **SFX:** footsteps on leaves, truck door, distant birds
- **Prompt:** `Wide shot at sunrise on a small-town street lined with autumn maple trees: MR. ANDERSON walks happily away down the sidewalk toward a vintage pickup truck with a fishing rod in the bed, puts on a fishing cap, turns back once and waves warmly. Golden backlight, leaves drifting.`

#### 7D · 01:26.0–01:29.0 · 3.0 s
- **Characters:** Jason
- **Camera:** Starts at a medium shot of Jason standing outside the shop with a smile and the keys in his hand → **slow crane pull-back and up** revealing the storefront, the street, and the town in morning light. Anderson's truck drives off in the corner of the frame.
- **VO:** "Next Owner brings them together."
- **SFX:** music swells to its peak
- **Transition:** the frame softly blurs/brightens into the logo card
- **Prompt:** `Medium shot of JASON standing on the sidewalk outside the brick plumbing shop at sunrise, keys in hand, looking up at the sign with a proud contented smile, then a slow cinematic crane pull-back rising high to reveal the storefront, the leafy main street and the small town glowing in morning light, a vintage pickup truck driving away in the corner of frame.`

#### 7E · END CARD · 01:29.0–01:32.0 *(optional 3 s; trim 7D to 2 s for an 88–90 s cut)*
- **Visual:** background = the last frame of 7D, blurred and darkened 40%. The **NEXT OWNER** logo (supplied vector) builds on with a soft key-turn motion: a key glyph rotates and "unlocks" the wordmark.
- **Text:**
  - `NEXT OWNER` (logo)
  - `The next generation of business ownership starts here.`
- **SFX:** key-turn click on the logo reveal, final sustained chord, silence
- **No AI generation:** build in After Effects with the brand's real logo files.

> **Final runtime:** 88.0 s with the end card trimmed (7D = 2 s), or 91 s at full length. Both fit the Reel brief. If 88 s is needed exactly, trim 1A to 1.5 s and 3B to 1.5 s.

---

## 6. Audio plan

### Voice casting (one fixed voice per character for the entire film)
| Character | Voice brief | Example ElevenLabs settings |
|---|---|---|
| Jason | Male, 24, bright, confident, quick, casual N. American | Stability 40, Style 35 |
| Mr. Anderson | Male, 63, warm baritone, light gravel, unhurried, chuckle in the voice | Stability 55, Style 25 |
| Maya | Female, 25, dry, teasing, quick-witted | Stability 40, Style 40 |
| Rosa | Female, 45, warm, familiar, teasing | Stability 50 |
| Narrator (VO) | Warm, intimate, not "announcer". Could be Mr. Anderson's voice for extra emotional payoff (recommended) | Stability 60 |

### Music cue sheet
| Time | Cue | Mood |
|---|---|---|
| 00:00–00:14 | M1 "Café" | light acoustic guitar, brushed drums, 100 BPM |
| 00:14–00:27.5 | M2 "Can't Verify" | pizzicato ticks + low synth pad, comedic tension, drops out under 2C/2E |
| 00:27.5–00:45 | M3 "Thirty Years" | solo piano + soft strings, nostalgic |
| 00:45–00:57 | M4 "Smarter Way" | playful arpeggio + claps, building curiosity |
| 00:57–01:07.5 | M5 "Verified" | pulsing synth + strings, satisfying, ends on a big downbeat |
| 01:07.5–01:19.5 | M6 "Connection" | acoustic guitar returns (M1 motif) with strings |
| 01:19.5–end | M7 "The Next Owner" | full emotional build of M3's piano theme + drums, peak at the logo |

*Tip:* use **one theme** (M3's piano melody) and re-orchestrate it for M6 and M7 so the ending feels earned.

### Mix
Dialogue −12 to −8 dBFS peaks, music ducked 8–10 dB under dialogue, SFX supportive. Final −14 LUFS integrated, −1 dBTP.

---

## 7. UI screen specs (build as real motion graphics, all text proofed)

| ID | Screen | Exact text |
|---|---|---|
| UI-1 | Generic marketplace grid (unbranded, grey/neutral styling) | Header "Business Listings". Cards: "Coffee Roastery · $420,000" / "Landscaping Co. · $310,000" / "Dental Lab · $1,200,000" / "Fitness Studio · $275,000" / "Established HVAC & Plumbing Services · $750,000" |
| UI-1b | Listing detail (generic) | "Asking price $750,000" · "Revenue $1,400,000" · "Profit $260,000" · small grey tag "Figures provided by seller" |
| UI-2 | Message inbox (Anderson) | "Would you take $50K cash today?" · "Is it still available??" · "Can you finance 100% of it for me?" |
| UI-3 | Next Owner AI search | Placeholder: "Describe the business you want to own…" · Query: "Find me an established plumbing business in Ontario, under $1 million, generating at least $200,000 in annual profit." |
| UI-4 | Results | "Searching listings…" → chips "Plumbing", "Ontario", "Under $1M", "$200K+ profit" → card "Anderson Plumbing & Heating · Hamilton, ON · Est. 1995 · Asking $890,000 · Annual profit $240,000" · button "View listing" |
| UI-5 | Financial Review | "Financial Review" · "2023 Financial Statements" · "2024 Financial Statements" · "Tax Returns" · "Bank Statements" · "Uploaded by seller" |
| UI-5b | AI comparison | "Comparing reported figures with supporting documents…" · "Listed revenue $1,412,000" · "Supporting documents $1,412,000" · "Sent for accountant review" |
| UI-6 | Checklist | "Financial documentation reviewed" · "CPA verification completed" · "Business performance analyzed" · "Acquisition opportunity available" · footer "Review status shown for this listing. Verification availability varies by listing." |
| UI-7 | Notification + messages | "Next Owner" · "A qualified buyer is interested in Anderson Plumbing & Heating" · Jason side: "Request a meeting" → "Meeting confirmed · Thursday 10:00 AM" |

Use Next Owner's real brand colours and typeface. If the real platform UI exists, base the screens on it (stylized) so the film doesn't promise features the product lacks.

---

## 8. Consistency & QA checklist
- [ ] Same 3 reference images per character attached to **every** generation.
- [ ] Locked descriptor pasted word for word; wardrobe identical (except Jason's polo in Scene 7).
- [ ] Jason's smartwatch is on the left wrist and Anderson's glasses are present in every shot (except where he takes them off).
- [ ] Generate 3–4 takes per shot and pick the best face match. Regenerate any shot with hand or face morphing.
- [ ] No AI-rendered text anywhere. All signage and UI are composited.
- [ ] Every caption and UI string proofed against §5/§7.
- [ ] Verification claims confirmed with Next Owner (Scene 5 note).
- [ ] Lip sync checked at 100% on a phone screen.
- [ ] Safe zones respected for the IG UI.
- [ ] Export 1080×1920, 24 fps, H.264, −14 LUFS.

## 9. Instagram caption (suggested)
> Every business has a story. Every entrepreneur has a dream. 🔑
> Meet Jason and Mr. Anderson. #NextOwner #BusinessForSale #Entrepreneurship #SmallBusiness #Acquisition
