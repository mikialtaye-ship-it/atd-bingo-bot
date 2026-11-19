/**
   * Find user by Username or Shop ID
   */
  async getUserByUsernameOrPhone(identifier) {
    if (!this.client || !identifier) return null;
    try {
      const cleaned = identifier.trim();

      // በ username ወይም በ shop_id መፈለግ
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .or(username.ilike.${cleaned},shop_id.ilike.${cleaned})
        .maybeSingle();

      if (error) {
        logger.error(Error finding user by identifier ${identifier}:, error.message);
        return null;
      }
      return data;
    } catch (err) {
      logger.error('Database query error in getUserByUsernameOrPhone:', err.message);
      return null;
    }
  }
