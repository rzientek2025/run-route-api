const express = require('express');
require('dotenv').config(); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API dla tras biegowych online działa!');
});

app.listen(port, () => {
  console.log(`Serwer nasłuchuje na porcie ${port}`);
});