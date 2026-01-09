export default async (value) => {
  const hash = await window.crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(value),
  );
  const hex = [...new Uint8Array(hash)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const url = `https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw response;
  }
  const data = await response.text();
  console.log(data);
  let hits = 0;
  data.split('\n').some((line) => {
    const parts = line.trim().split(':');
    if (parts[0] === hash.slice(5)) {
      hits = +parts[1];
      return true;
    }
    return false;
  });
  return hits;
};
