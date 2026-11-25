export function LevelBar() {
  return (
    <div className="level" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
