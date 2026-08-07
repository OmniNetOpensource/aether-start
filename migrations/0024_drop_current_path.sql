-- currentPath 彻底移出服务端:路径是客户端视图状态,由客户端按最新 assistant 消息重建。
ALTER TABLE conversation_bodies DROP COLUMN current_path_json;
