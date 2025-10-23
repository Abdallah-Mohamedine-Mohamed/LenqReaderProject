/*
  # Fix delete_user_by_phone function
  
  ## Overview
  Fix the delete_user_by_phone function to properly delete from users table
  which will cascade to auth.users via the foreign key relationship.
  
  ## Changes
  - Update function to delete from users table instead of auth.users
*/

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
  
  -- Delete from users table (this will handle cleanup)
  DELETE FROM users WHERE id = v_user_record.id;
  
  -- Also try to delete from auth.users if it exists
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
