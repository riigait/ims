import 'dotenv/config';
import app from './app';
import { checkDatabaseConnection } from './utils/prisma';

const PORT = process.env.PORT || 3001;

checkDatabaseConnection().then(() => {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`✅ Database connected`);
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });
});
