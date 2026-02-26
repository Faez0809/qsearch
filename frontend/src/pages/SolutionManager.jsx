import React from 'react'
import { useEffect, useState } from 'react'
import SolutionForm from '../components/SolutionForm'
import SolutionList from '../components/SolutionList'

function SolutionManager() {
  const [solutions, setSolutions] = useState([])

  useEffect(() => {
    const fetchSolutions = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/solutions')
        if (!response.ok) {
          throw new Error('Failed to fetch solutions')
        }

        const data = await response.json()
        setSolutions(data)
      } catch (error) {
        console.error(error)
      }
    }

    fetchSolutions()
  }, [])

  const addSolution = async (newSolution) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/solutions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSolution),
      })

      if (!response.ok) {
        throw new Error('Failed to add solution')
      }

      const createdSolution = await response.json()
      setSolutions((previousSolutions) => [...previousSolutions, createdSolution])
    } catch (error) {
      console.error(error)
    }
  }

  const deleteSolution = async (id) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/solutions/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete solution')
      }

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
