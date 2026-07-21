const path = require('path');
const dotenv = require('dotenv');
const result = dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('dotenv result:', result);
console.log('DATABASE_URL from process.env:', process.env.DATABASE_URL);
console.log('DATABASE_URL from process.env.DATABASE_URL:', process.env.DATABASE_URL);
