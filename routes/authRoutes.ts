import { Router } from 'express';
import { signup, login, getAllUsers } from '../controllers/authController.js'; // Check karein ye import hai?
// import { authenticateToken } from '../middleware/authMiddleware.js'; // Agar middleware hai

const router = Router();

router.post('/signup', signup);
router.post('/login', login);


router.get('/users', getAllUsers); 

export default router;