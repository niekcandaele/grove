export function relativeDate(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 120) return "1 minute ago";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 120) return "1 hour ago";

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  if (hours < 48) return "1 day ago";

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "1 month ago";

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  if (months < 24) return "1 year ago";

  const years = Math.floor(months / 12);
  return `${years} years ago`;
}
