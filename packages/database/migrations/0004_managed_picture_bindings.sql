-- Custom SQL migration file, put your code below! --
CREATE FUNCTION sync_user_picture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE managed_file_id uuid;
BEGIN
  IF NEW.image IS NULL THEN
    DELETE FROM user_pictures WHERE user_id = NEW.id;
  ELSE
    managed_file_id := substring(NEW.image FROM '^/api/v1/files/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/content$')::uuid;
    IF managed_file_id IS NULL THEN
      RAISE EXCEPTION 'User pictures require a managed file URL' USING ERRCODE = '23514';
    END IF;
    INSERT INTO user_pictures (id, user_id, file_id, purpose)
      VALUES (gen_random_uuid(), NEW.id, managed_file_id, 'avatar')
      ON CONFLICT (user_id) DO UPDATE SET file_id = EXCLUDED.file_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_picture_sync AFTER INSERT OR UPDATE OF image ON "user"
FOR EACH ROW EXECUTE FUNCTION sync_user_picture();
--> statement-breakpoint
CREATE FUNCTION sync_organization_picture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE managed_file_id uuid;
BEGIN
  IF NEW.logo IS NULL THEN
    DELETE FROM organization_pictures WHERE organization_id = NEW.id;
  ELSE
    managed_file_id := substring(NEW.logo FROM '^/api/v1/files/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/content$')::uuid;
    IF managed_file_id IS NULL THEN
      RAISE EXCEPTION 'Organization pictures require a managed file URL' USING ERRCODE = '23514';
    END IF;
    INSERT INTO organization_pictures (id, organization_id, file_id, purpose)
      VALUES (gen_random_uuid(), NEW.id, managed_file_id, 'organization-logo')
      ON CONFLICT (organization_id) DO UPDATE SET file_id = EXCLUDED.file_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organization_picture_sync AFTER INSERT OR UPDATE OF logo ON organization
FOR EACH ROW EXECUTE FUNCTION sync_organization_picture();
