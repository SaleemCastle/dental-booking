export const toModuleId = (tab: string) =>
    tab.trim().split(' ').join('_').toLowerCase()

export const formatModuleLabel = (moduleId: string) =>
    moduleId.split('_').join(' ')

export const formatTabs = (tab: string) =>
    tab.includes('_') ? formatModuleLabel(tab) : toModuleId(tab)

export const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }
    return date.toLocaleDateString('en-US', options)
}
