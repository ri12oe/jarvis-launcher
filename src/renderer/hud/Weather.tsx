const LINES = ["Humidity", "Feels like", "Precipitation", "Visibility", "Wind", "Pressure", "Sunrise", "Sunset"];

/** Placeholder. Values stay "--" until a weather source is wired. */
export function Weather() {
  return (
    <section className="weather" aria-label="Weather">
      <p className="weather-place">--</p>
      <p className="weather-temp">--</p>
      <p className="weather-cond">--</p>
      <ul>
        {LINES.map((line) => (
          <li key={line}>
            <span>{line}</span>
            <span>--</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
