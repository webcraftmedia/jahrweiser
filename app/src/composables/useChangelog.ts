export function useChangelog() {
  const shouldOpen = useState('changelog-should-open', () => false)
  return {
    openChangelog: () => {
      shouldOpen.value = true
    },
    shouldOpen,
  }
}
