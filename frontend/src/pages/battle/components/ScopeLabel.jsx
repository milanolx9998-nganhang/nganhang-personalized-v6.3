import React from 'react';

export default function ScopeLabel({ scope, options }) {
  if (!scope || scope.subject_id === null || scope.subject_id === undefined) {
    return <span>Chưa chọn nội dung</span>;
  }

  // Nếu máy chủ đã đính kèm chuỗi mô tả sẵn
  if (scope.label && typeof scope.label === 'string') {
    return <span>{scope.label}</span>;
  }

  const subjects = Array.isArray(options?.subjects) ? options.subjects : [];
  const branches = Array.isArray(options?.branches) ? options.branches : [];
  const topics = Array.isArray(options?.topics) ? options.topics : [];

  const subjectObj = subjects.find(
    (s) => Number(s.id) === Number(scope.subject_id)
  );
  const subjectName =
    subjectObj?.name || scope.subject_name || 'Khoa học tự nhiên';

  const branchObj =
    scope.branch_id !== undefined && scope.branch_id !== null
      ? branches.find((b) => Number(b.id) === Number(scope.branch_id))
      : null;
  const branchName = branchObj?.name || scope.branch_name || '';

  const parts = [subjectName];
  if (branchName) {
    parts.push(branchName);
  }

  if (scope.chapter) {
    parts.push(String(scope.chapter));
  } else if (Array.isArray(scope.topic_ids) && scope.topic_ids.length > 0) {
    if (scope.topic_ids.length === 1) {
      const singleId = Number(scope.topic_ids[0]);
      const topicObj = topics.find((t) => Number(t.id) === singleId);
      parts.push(topicObj?.name || scope.topic_name || '1 Bài');
    } else {
      parts.push(`${scope.topic_ids.length} Bài`);
    }
  } else if (scope.topic_name) {
    parts.push(String(scope.topic_name));
  }

  return <span>{parts.join(' · ')}</span>;
}
