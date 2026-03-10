import React, { useEffect, useMemo, useState } from 'react'
function toAbsoluteUrl(path, apiBase) {
  if (!path) {
    return null
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  return `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`
}

function getImageCandidatesFromAudio(audioUrl) {
  if (!audioUrl) {
    return []
  }

  const extensionVariants = ['.jpg', '.jpeg', '.png', '.webp']
  const markers = [
    { audio: '/Udvash/', image: '/QnA/' },
    { audio: '/udvash/', image: '/qna/' },
    { audio: '/media/udvash/', image: '/media/qna/' },
  ]

  for (const marker of markers) {
    const markerIndex = audioUrl.indexOf(marker.audio)
    if (markerIndex < 0) {
      continue
    }

    const prefix = audioUrl.slice(0, markerIndex) + marker.image
    const filename = audioUrl.slice(markerIndex + marker.audio.length)
    if (!filename) {
      return []
    }

    const dotIndex = filename.lastIndexOf('.')
    const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
    const decodedStem = decodeURIComponent(stem)
    const encodedStem = encodeURIComponent(decodedStem)
    return extensionVariants.map((extension) => `${prefix}${encodedStem}${extension}`)
  }

  return []
}

function ResultCard({ result, apiBase }) {
  const imageUrl = toAbsoluteUrl(result.image_path, apiBase)
  const audioUrl = toAbsoluteUrl(result.audio_path, apiBase)
  const imageCandidates = useMemo(() => {
    const candidates = []
    if (imageUrl) {
      candidates.push(imageUrl)
    }
    for (const candidate of getImageCandidatesFromAudio(audioUrl)) {
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate)
      }
    }
    return candidates
  }, [audioUrl, imageUrl])
  const [imageIndex, setImageIndex] = useState(0)

  useEffect(() => {
    setImageIndex(0)
  }, [imageCandidates])

  const activeImageUrl = imageCandidates[imageIndex] || null

  return (
    <article className="result-card">
      <div className="result-card-header">
        <h3 className="result-question">{result.text}</h3>
        <span className="match-badge">{result.similarity}% match</span>
      </div>

      {activeImageUrl ? (
        <img
          src={activeImageUrl}
          alt={result.text}
          className="result-image"
          loading="lazy"
          onError={() => {
            if (imageIndex < imageCandidates.length - 1) {
              setImageIndex((current) => current + 1)
            } else {
              setImageIndex(imageCandidates.length)
            }
          }}
        />
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

