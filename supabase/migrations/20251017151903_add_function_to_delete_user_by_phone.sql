/*
  # Add function to delete user by phone number
  
  ## Overview
  This migration adds an admin function to delete a user account by phone number.
  This is useful for testing and for users who want to delete their account completely.
  
  ## Changes
  - Create function `delete_user_by_phone` that admins can use to delete user accounts
  - Function deletes from auth.users which cascades to all related tables
*/

-- ============================================================
-- FUNCTION: DELETE USER BY PHONE NUMBER (ADMIN ONLY)
-- ============================================================

CREATE OR REPLACE FUNCTION delete_user_by_phone(p_numero_whatsapp TEXT)
RETURNS jsonb AS $$
DECLARE
  v_user_record RECORD;
  v_deleted boolean := false;
BEGIN
  -- Find user with this phone number
  SELECT id, numero_whatsapp, whatsapp_verifie, email
  INTO v_user_record
  FROM users
  WHERE numero_whatsapp = p_numero_whatsapp;
  
  -- If user not found
  IF v_user_record.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Aucun utilisateur trouvé avec ce numéro'
    );
  END IF;
  
  -- Delete from auth.users (cascade will handle users table and all related data)
  DELETE FROM auth.users WHERE id = v_user_record.id;
  
  v_deleted := true;
  
  RETURN jsonb_build_object(
    'success', v_deleted,
    'message', 'Utilisateur supprimé avec succès',
    'deleted_user', jsonb_build_object(
      'id', v_user_record.id,
      'numero_whatsapp', v_user_record.numero_whatsapp,
      'email', v_user_record.email,
      'was_verified', v_user_record.whatsapp_verifie
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission (anyone can call it, but typically for admin use)
GRANT EXECUTE ON FUNCTION delete_user_by_phone(TEXT) TO authenticated, anon;
