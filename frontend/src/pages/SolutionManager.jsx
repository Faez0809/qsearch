import React from 'react'
import { useEffect, useState } from 'react'
import SolutionForm from '../components/SolutionForm'
import SolutionList from '../components/SolutionList'

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD
    ? 'https://qsearch-9ejl.onrender.com'
    : 'http://127.0.0.1:8000')
const buildUrl = (path) => `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchWithRetry = async (path, options = {}, retries = 4, waitMs = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(buildUrl(path), options)
      if (response.ok) {
        return response
      }
    } catch {
      // Retry on transient network or cold-start issues.
    }
    if (attempt < retries) {
      await sleep(waitMs)
    }
  }
  throw new Error('Backend request failed after retries')
}

function SolutionManager() {
  const [solutions, setSolutions] = useState([])

  useEffect(() => {
    const fetchSolutions = async () => {
      try {
        const response = await fetchWithRetry('/solutions')
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
      const response = await fetchWithRetry('/solutions', {
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
      await fetchWithRetry(`/solutions/${id}`, {
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

