import { useEffect, useRef, useState } from "react";
import { PLATE_SLOTS } from "../../shared/mario";
import { cloneDefaultConfig } from "../../shared/config";
import { acceleratorFromKey, settingsFromConfig, type Place, type SettingsValues } from "../../shared/settings";
import type { LauncherTileView } from "../../shared/types";

const PLATE_NAMES = [...PLATE_SLOTS.keys()];

function TileSelect({
  value,
  tiles,
  empty,
  label,
  onChange,
}: {
  value: string | null;
  tiles: readonly LauncherTileView[];
  empty: string;
  label: string;
  onChange: (id: string | null) => void;
}) {
  const known = value === null || tiles.some((tile) => tile.id === value);
  return (
    <select aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{empty}</option>
      {!known && value ? <option value={value}>{`${value} (not found)`}</option> : null}
      {tiles.map((tile) => (
        <option key={tile.id} value={tile.id}>
          {tile.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Settings over the reactor. Loads the saved values when it opens, and saves
 * through the main process, which checks them and writes config.json. Esc or
 * Cancel closes it without saving.
 */
export function SettingsPanel({
  tiles,
  onClose,
  onSaved,
}: {
  tiles: readonly LauncherTileView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<SettingsValues | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeNote, setPlaceNote] = useState("");
  const firstField = useRef<HTMLInputElement>(null);
  const sorted = [...tiles].sort((a, b) => a.label.localeCompare(b.label));

  useEffect(() => {
    const bridge = window.jarvis;
    if (!bridge) {
      // The Vite preview has no main process: show the defaults so the layout can be checked.
      if (import.meta.env.DEV) setValues(settingsFromConfig(cloneDefaultConfig()));
      else setError("Settings need the Jarvis app");
      return;
    }
    let cancelled = false;
    void bridge
      .getSettings()
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) setValues(loaded);
        else setError("Could not read settings");
      })
      .catch(() => {
        if (!cancelled) setError("Could not read settings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (values) firstField.current?.focus();
  }, [values === null]);

  const update = (patch: Partial<SettingsValues>) => setValues((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    const bridge = window.jarvis;
    if (!bridge || !values) return;
    if (values.weather && values.weather.latitude === 0 && values.weather.longitude === 0) {
      setError("Pick a city with FIND, or type its latitude and longitude");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await bridge.saveSettings(values);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save");
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  };

  const findPlace = async () => {
    const bridge = window.jarvis;
    if (!bridge) return;
    setPlaceNote("Searching...");
    setPlaces([]);
    try {
      const result = await bridge.findPlace(placeQuery);
      if (!result.ok) setPlaceNote(result.error ?? "Place search failed");
      else if (!result.places?.length) setPlaceNote("No places found");
      else {
        setPlaceNote("");
        setPlaces(result.places);
      }
    } catch {
      setPlaceNote("Place search failed");
    }
  };

  const locate = async () => {
    const bridge = window.jarvis;
    if (!bridge) return;
    setPlaceNote("Finding your location...");
    setPlaces([]);
    try {
      const result = await bridge.locate();
      if (!result.ok || !result.place) {
        setPlaceNote(result.error ?? "Location lookup failed");
        return;
      }
      const place = result.place;
      setPlaceNote(`Found ${place.label}. Check it, then SAVE.`);
      setValues((current) =>
        current && current.weather ? { ...current, weather: { ...current.weather, ...place } } : current,
      );
    } catch {
      setPlaceNote("Location lookup failed");
    }
  };

  const weather = values?.weather ?? null;

  return (
    <div
      className="settings"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="settings-head">
        <h2>SETTINGS</h2>
        <button type="button" className="settings-x" aria-label="Close settings" onClick={onClose}>
          ✕
        </button>
      </header>

      {!values ? (
        <p className="settings-error">{error || "Loading..."}</p>
      ) : (
        <form
          className="settings-body"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <section>
            <h3>STARTUP</h3>
            <label className="row">
              <span>Hotkey</span>
              <input
                ref={firstField}
                className="hotkey"
                value={values.hotkey}
                readOnly
                aria-describedby="hotkey-hint"
                onKeyDown={(event) => {
                  if (event.key === "Tab" || event.key === "Escape" || event.key === "Enter") return;
                  event.preventDefault();
                  const accelerator = acceleratorFromKey(event);
                  if (accelerator) update({ hotkey: accelerator });
                }}
              />
            </label>
            <p id="hotkey-hint" className="hint">
              Click the box and press the new key combination, for example Ctrl+Alt+J.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={values.openAtLogin}
                onChange={(event) => update({ openAtLogin: event.target.checked })}
              />
              <span>Start Jarvis when I sign in to Windows</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={values.startHidden}
                onChange={(event) => update({ startHidden: event.target.checked })}
              />
              <span>Start hidden (show with the hotkey or the tray)</span>
            </label>
          </section>

          <section>
            <h3>WEATHER</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={weather !== null}
                onChange={(event) =>
                  update({
                    weather: event.target.checked
                      ? { latitude: 0, longitude: 0, label: "", units: "fahrenheit" }
                      : null,
                  })
                }
              />
              <span>Show the weather (sends only these coordinates to Open-Meteo)</span>
            </label>
            {weather ? (
              <>
                <div className="row">
                  <span>Find city</span>
                  <input
                    value={placeQuery}
                    placeholder="Indianapolis"
                    aria-label="City to look up"
                    onChange={(event) => setPlaceQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void findPlace();
                      }
                    }}
                  />
                  <button type="button" className="small" onClick={() => void findPlace()}>
                    FIND
                  </button>
                  <button type="button" className="small" onClick={() => void locate()}>
                    USE MY LOCATION
                  </button>
                </div>
                <p className="hint">
                  USE MY LOCATION looks up your approximate city from your internet address (ipapi.co), only when you
                  press it.
                </p>
                {placeNote ? <p className="hint">{placeNote}</p> : null}
                {places.length > 0 ? (
                  <ul className="places">
                    {places.map((place) => (
                      <li key={`${place.label}-${place.latitude}`}>
                        <button
                          type="button"
                          onClick={() => {
                            update({ weather: { ...weather, ...place } });
                            setPlaces([]);
                          }}
                        >
                          {place.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <label className="row">
                  <span>Name</span>
                  <input value={weather.label} maxLength={80} onChange={(event) => update({ weather: { ...weather, label: event.target.value } })} />
                </label>
                <div className="row">
                  <span>Lat / Long</span>
                  <input
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    aria-label="Latitude"
                    value={weather.latitude}
                    onChange={(event) => update({ weather: { ...weather, latitude: Number(event.target.value) } })}
                  />
                  <input
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    aria-label="Longitude"
                    value={weather.longitude}
                    onChange={(event) => update({ weather: { ...weather, longitude: Number(event.target.value) } })}
                  />
                  <select
                    aria-label="Units"
                    value={weather.units}
                    onChange={(event) =>
                      update({ weather: { ...weather, units: event.target.value === "celsius" ? "celsius" : "fahrenheit" } })
                    }
                  >
                    <option value="fahrenheit">°F</option>
                    <option value="celsius">°C</option>
                  </select>
                </div>
              </>
            ) : null}
          </section>

          <section>
            <h3>LEFT LIST</h3>
            <label className="row">
              <span>Shows</span>
              <select
                aria-label="Left list shows"
                value={values.leftList}
                onChange={(event) => update({ leftList: event.target.value === "design" ? "design" : "recent" })}
              >
                <option value="recent">My recent files</option>
                <option value="design">The design text</option>
              </select>
            </label>
          </section>

          <section>
            <h3>DOCK</h3>
            <div className="grid">
              {values.dock.map((id, index) => (
                <label key={index} className="cell">
                  <span>Icon {index + 1}</span>
                  <TileSelect
                    value={id}
                    tiles={sorted}
                    empty="Empty"
                    label={`Dock icon ${index + 1}`}
                    onChange={(next) => update({ dock: values.dock.map((old, at) => (at === index ? next : old)) })}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3>REACTOR DIALS</h3>
            <div className="grid">
              {(["G", "E"] as const).map((name) => (
                <label key={name} className="cell">
                  <span>{name} dial</span>
                  <TileSelect
                    value={values.dials[name]}
                    tiles={sorted}
                    empty="None"
                    label={`${name} dial`}
                    onChange={(next) => update({ dials: { ...values.dials, [name]: next } })}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3>REACTOR PLATES</h3>
            <div className="grid">
              {PLATE_NAMES.map((name) => (
                <label key={name} className="cell">
                  <span>{name}</span>
                  <TileSelect
                    value={values.plates[name] ?? null}
                    tiles={sorted}
                    empty="None"
                    label={`Plate ${name}`}
                    onChange={(next) => {
                      const plates = { ...values.plates };
                      if (next) plates[name] = next;
                      else delete plates[name];
                      update({ plates });
                    }}
                  />
                </label>
              ))}
            </div>
          </section>

          {error ? (
            <p className="settings-error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="settings-foot">
            <button type="button" className="ghost" onClick={() => void window.jarvis?.openConfig()}>
              OPEN CONFIG.JSON
            </button>
            <span className="spacer" />
            <button type="button" className="ghost" onClick={onClose}>
              CANCEL
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "SAVING" : "SAVE"}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}
