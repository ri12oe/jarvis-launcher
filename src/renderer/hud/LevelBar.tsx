export function LevelBar() {
  return (
    <div className="level" aria-hidden="true">
      <span className="level-arrow up" />
      <span className="level-segments">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} />
        ))}
      </span>
      <span className="level-arrow down" />
    </div>
  );
}
