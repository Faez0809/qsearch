import React from 'react'
import { useEffect, useState } from 'react'
import SolutionForm from '../components/SolutionForm'
import SolutionList from '../components/SolutionList'

const PRIMARY_API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD
    ? '/api'
    : 'http://127.0.0.1:8000')
const RENDER_API_BASE = 'https://qsearch-9ejl.onrender.com'
const API_BASES = import.meta.env.PROD
  ? [PRIMARY_API_BASE, RENDER_API_BASE]
  : [PRIMARY_API_BASE]

const buildUrl = (base, path) =>
  `${base}${path.startsWith('/') ? '' : '/'}${path}`

const fetchWithFallback = async (path, options) => {
  const uniqueBases = [...new Set(API_BASES)]

  for (const base of uniqueBases) {
    try {
      const response = await fetch(buildUrl(base, path), options)
      if (response.ok) {
        return response
      }
    } catch {
      // Try next backend target.
    }
  }
  throw new Error('All backend targets failed')
}

function SolutionManager() {
  const [solutions, setSolutions] = useState([])

  useEffect(() => {
    const fetchSolutions = async () => {
      try {
        const response = await fetchWithFallback('/solutions')
        const data = await response.json()
        setSolutions(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error(error)
      }
    }

    fetchSolutions()
  }, [])

  const addSolution = async (newSolution) => {
    try {
      const response = await fetchWithFallback('/solutions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSolution),
      })

      const createdSolution = await response.json()
      setSolutions((previousSolutions) => [...previousSolutions, createdSolution])
    } catch (error) {
      console.error(error)
    }
  }

  const deleteSolution = async (id) => {
    try {
      await fetchWithFallback(`/solutions/${id}`, {
        method: 'DELETE',
      })

      setSolutions((previousSolutions) =>
        previousSolutions.filter((solution) => solution.id !== id),
      )
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="page-content">
      <div className="info-card">
        <SolutionForm onAdd={addSolution} />
      </div>
      <div className="info-card">
        <SolutionList solutions={solutions} onDelete={deleteSolution} />
      </div>
    </div>
  )
}

export default SolutionManager

