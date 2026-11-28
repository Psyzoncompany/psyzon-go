# Interface audio

## PS5 interaction effects, revision 3

The interaction clips use the PS5 UI resources distributed by OrbisPro at
[revision e26505a](https://github.com/SvenGDK/OrbisPro/tree/e26505a0eea40a0368ea1fa67c24c0b7993f57cb/OrbisPro/Resources).
These are community-distributed console recordings/resources, not an official Sony download or an endorsement.

| Site action | Source resource | Shipped file | Duration | Peak |
| --- | --- | --- | --- | --- |
| Confirm / button | `ps5_uiselect.wav` | `ps5-confirm-v3.wav` | 0.641 s | -6 dBFS |
| Change page in PS5 theme | `ps5_uimove.wav` | `ps5-navigate-v3.wav` | 0.400 s | -10 dBFS |
| Close / back in PS5 theme | `ps5_uiback.wav` | `ps5-close-v3.wav` | 1.044 s | -6 dBFS |

The files retain stereo 48 kHz / 16-bit PCM without lossy re-encoding. Processing
removes DC offset, balances peak gain, adds a 4 ms raised-cosine attack and up to
80 ms release at the existing end, and appends at least 40 ms silence (254 ms on the short navigation effect to allow media fallback preroll). The source reverb
is retained; no synthesized effect or artificial noise is added.

Technical verification found zero clipped output samples, silent first/last
samples and no large adjacent-sample discontinuities. This is a signal analysis,
not a guarantee about every speaker/headphone or a calibrated listening test.
The replaced `ps5-press-bottan-v2.mp3` decoded above 0 dBFS, with 16 mono samples
at or above full scale. It is retained only for older cached versions.

Playback adds a 6 ms attack and final 40 ms release, and crossfades interrupted
interaction effects over 60 ms. Page changes replace the initiating click;
closing a window uses its own effect. Existing account volume/mute settings apply.

## Earlier effects retained

MP3 effects selected by the site owner from these Myinstants pages:

- `ps5-selection-button-v1.mp3`: https://www.myinstants.com/pt/instant/ps5-selection-button-64765/ — page navigation.
- `ps5-press-bottan-v2.mp3`: https://www.myinstants.com/pt/instant/ps5-press-bottan-49778/ — buttons and taps; a 240 ms fade-out and a 6 ms fade-in soften the original clip, followed by 35 ms of silence. The original is kept as `ps5-press-bottan-v1.mp3`.
- `ps5_start-v1.mp3`: https://www.myinstants.com/pt/instant/ps5-startup-sound-57939/ — first interaction after opening the app.
- `ps5-notification-v1.mp3`: https://www.myinstants.com/pt/instant/ps5-notification-48476/ — new pending notifications while the app is open.
- `ps5-original-trophy-v1.mp3`: https://www.myinstants.com/pt/instant/ps5-original-trophy-45366/ — confirmed completions.

The other downloaded MP3 files retain their original bytes. Playback gain follows the account's sound settings. `type-v1.mp3` is the existing original typing effect. Replaced and interrupted clicks fade out for 60 ms before stopping.
