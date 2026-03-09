import React from 'react'
function toAbsoluteUrl(path, apiBase) {
  if (!path) {
    return null
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  return `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`
}

function ResultCard({ result, apiBase }) {
  const imageUrl = toAbsoluteUrl(result.image_path, apiBase)
  const audioUrl = toAbsoluteUrl(result.audio_path, apiBase)

  return (
    <article className="result-card">
      <div className="result-card-header">
        <h3 className="result-question">{result.text}</h3>
        <span className="match-badge">{result.similarity}% match</span>
      </div>

      {imageUrl ? (
        <img src={imageUrl} alt={result.text} className="result-image" loading="lazy" />
      ) : (
        <div className="result-image-placeholder" aria-hidden="true">
          No image available
        </div>
      )}

      {audioUrl ? (
        <audio className="result-audio" controls preload="none" src={audioUrl}>
          Your browser does not support the audio element.
        </audio>
      ) : (
        <p className="solution-answer">No audio available</p>
      )}
    </article>
  )
}

export default ResultCard

