require('dotenv').config();
const app = require('./app');
const { startCronJobs } = require('./jobs/nightly');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`FG Inventory backend running on port ${PORT}`);
  startCronJobs();
});
