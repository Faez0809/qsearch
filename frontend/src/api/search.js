export async function searchQuery(query) {
  const response = await fetch('http://127.0.0.1:8000/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error('Search failed')
  }

  return response.json()
}
