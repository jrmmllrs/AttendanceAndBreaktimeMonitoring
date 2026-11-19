export function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
}
