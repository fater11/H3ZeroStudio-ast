# REF / FLF mutual exclusion

- A scene with REF assets or character cards cannot switch to FLF until those assets are removed.
- Python validates this condition before model loading or generation.
- Existing assets are never deleted automatically.
- FLF frames remain saved when switching back to REF but are inactive.
- The continuation LAST FRAME + Hidden Context is a separate conditioning mechanism and is not treated as a user REF asset.
