// In programRoutes.js
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT programId, programme FROM programs ORDER BY programme');
        res.status(200).json(rows);
    } // ...
});