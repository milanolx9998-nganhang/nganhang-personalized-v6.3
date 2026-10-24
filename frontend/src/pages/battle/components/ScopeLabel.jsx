import React from 'react';

export default function ScopeLabel({ scope, scopeLabel, options }) {
  // Ưu tiên nhãn đã dịch sẵn từ máy chủ theo hợp đồng V6.9.4
  if (scopeLabel && typeof scopeLabel.label === 'string' && scopeLabel.label.trim()) {
    return <span>{scopeLabel.label}</span>;
  }
  if (scope?.scope_label && typeof scope.scope_label.label === 'string' && scope.scope_label.label.trim()) {
    return <span>{scope.scope_label.label}</span>;
  }

  const hasSubjectIds = Array.isArray(scope?.subject_ids) && scope.subject_ids.length > 0;
  if (
    !scope ||
    ((scope.subject_id === null || scope.subject_id === undefined) && !hasSubjectIds && !scope.label)
  ) {
    return <span>Chưa chọn nội dung</span>;
  }

  // Nếu máy chủ đã đính kèm chuỗi mô tả sẵn
  if (scope.label && typeof scope.label === 'string') {
    return <span>{scope.label}</span>;
  }

  const subjects = Array.isArray(options?.subjects) ? options.subjects : [];
  const branches = Array.isArray(options?.branches) ? options.branches : [];
  const topics = Array.isArray(options?.topics) ? options.topics : [];

  let subjectName = 'Môn học';
  if (hasSubjectIds) {
    subjectName = scope.subject_ids
      .map((id) => {
        const sObj = subjects.find((s) => Number(s.id) === Number(id));
        return sObj?.name || `Môn ${id}`;
      })
      .join(' + ');
  } else {
    const subjectObj = subjects.find(
      (s) => Number(s.id) === Number(scope.subject_id)
    );
    subjectName = subjectObj?.name || scope.subject_name || 'Môn học';
  }

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
