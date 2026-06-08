import fetch from 'node-fetch'

async function test() {
  const res = await fetch('http://localhost:3001/api/reporting/department-consumption')
  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Data:', JSON.stringify(data, null, 2))
}

test()
